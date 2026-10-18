(() => {
  const recordButton = document.querySelector('#recordButton');
  const stopButton = document.querySelector('#stopButton');
  const preview = document.querySelector('#preview');
  const previewVideo = document.querySelector('#previewVideo');
  const placeholder = document.querySelector('#placeholder');
  const recordState = document.querySelector('#recordState');
  const stateText = document.querySelector('#stateText');
  const recordButtonText = document.querySelector('#recordButtonText');
  const previewTime = document.querySelector('#previewTime');
  const notice = document.querySelector('#notice');
  const savedCard = document.querySelector('#savedCard');
  const savedDetails = document.querySelector('#savedDetails');
  const downloadButton = document.querySelector('#downloadButton');
  const micToggle = document.querySelector('#micToggle');
  const micSelect = document.querySelector('#micSelect');

  let recorder = null;
  let captureStream = null;
  let cameraStream = null;
  let screenStream = null;
  let audioContext = null;
  let recordingChunks = [];
  let timerHandle = null;
  let recordingStart = 0;
  let previewUrl = null;

  const selectedSource = () => document.querySelector('input[name="source"]:checked').value;

  function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle('error', isError);
    notice.hidden = false;
  }

  function clearNotice() {
    notice.hidden = true;
    notice.textContent = '';
    notice.classList.remove('error');
  }

  function formatTime(milliseconds) {
    const total = Math.floor(milliseconds / 1000);
    const hours = String(Math.floor(total / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const seconds = String(total % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function startTimer() {
    recordingStart = Date.now();
    previewTime.textContent = '00:00:00';
    timerHandle = window.setInterval(() => {
      previewTime.textContent = formatTime(Date.now() - recordingStart);
    }, 250);
  }

  function stopTimer() {
    if (timerHandle !== null) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  async function refreshMicrophones() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      const previous = micSelect.value;
      micSelect.replaceChildren(new Option('Standart mikrofon', ''));
      microphones.forEach((device, index) => {
        const label = device.label || `Mikrofon ${index + 1}`;
        micSelect.add(new Option(label, device.deviceId));
      });
      if ([...micSelect.options].some((option) => option.value === previous)) {
        micSelect.value = previous;
      }
    } catch (error) {
      showNotice(`Mikrofon qurilmalarini tekshirib bo‘lmadi: ${error.message}`, true);
    }
  }

  async function getMicrophone() {
    if (!micToggle.checked) return null;
    const audio = micSelect.value ? { deviceId: { exact: micSelect.value } } : true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    await refreshMicrophones();
    return stream;
  }

  async function addMixedAudio(streams, output) {
    const audioTracks = streams.flatMap((stream) => stream ? stream.getAudioTracks() : []);
    if (audioTracks.length === 0) return;
    audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    for (const track of audioTracks) {
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      source.connect(destination);
    }
    destination.stream.getAudioTracks().forEach((track) => output.addTrack(track));
    if (audioContext.state === 'suspended') await audioContext.resume();
  }

  async function requestScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Bu brauzer ekran yozishni qo‘llamaydi. Chrome yoki Edge’ning yangilangan versiyasini oching.');
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
  }

  function waitForVideo(video, stream) {
    video.srcObject = stream;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Kamera yoki ekran videosi ishga tushmadi.')), 10000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        video.play().then(resolve).catch(reject);
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error('Video manbasini ochib bo‘lmadi.'));
      };
    });
  }

  async function createCombinedStream(screen, camera, microphone) {
    const screenVideo = document.createElement('video');
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    await waitForVideo(screenVideo, screen);
    const cameraVideo = document.createElement('video');
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
    await waitForVideo(cameraVideo, camera);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Ekran va kamerani birlashtirib bo‘lmadi.');

    const draw = () => {
      const width = screenVideo.videoWidth || 1280;
      const height = screenVideo.videoHeight || 720;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(screenVideo, 0, 0, width, height);
      const inset = Math.round(Math.min(width, height) * 0.25);
      const margin = Math.round(Math.min(width, height) * 0.035);
      const insetHeight = Math.round(inset * cameraVideo.videoHeight / cameraVideo.videoWidth);
      const x = width - inset - margin;
      const y = height - insetHeight - margin;
      context.save();
      context.shadowColor = '#0009';
      context.shadowBlur = Math.max(8, margin / 2);
      context.fillStyle = '#101114';
      context.beginPath();
      context.roundRect(x - 2, y - 2, inset + 4, insetHeight + 4, Math.max(8, margin / 2));
      context.fill();
      context.restore();
      context.save();
      context.beginPath();
      context.roundRect(x, y, inset, insetHeight, Math.max(7, margin / 2));
      context.clip();
      context.drawImage(cameraVideo, x, y, inset, insetHeight);
      context.restore();
      window.requestAnimationFrame(draw);
    };
    draw();

    const output = canvas.captureStream(30);
    await addMixedAudio([screen, microphone], output);
    previewVideo.srcObject = output;
    previewVideo.muted = true;
    preview.classList.add('has-video');
    await previewVideo.play();
    return output;
  }

  function chooseMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  async function startRecording() {
    clearNotice();
    savedCard.hidden = true;
    recordButton.disabled = true;
    recordingChunks = [];

    try {
      if (!window.isSecureContext || !navigator.mediaDevices) {
        throw new Error('Brauzer yozuvga ruxsat bermadi. start-capture-studio.cmd orqali ishga tushiring yoki Chrome/Edge’da localhost manzilidan oching.');
      }

      const source = selectedSource();
      if (source === 'screen' || source === 'both') {
        screenStream = await requestScreen();
      }
      if (source === 'camera' || source === 'both') {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      const microphone = await getMicrophone();

      if (source === 'screen') {
        captureStream = new MediaStream(screenStream.getVideoTracks());
        await addMixedAudio([screenStream, microphone], captureStream);
        previewVideo.srcObject = screenStream;
        previewVideo.muted = true;
        preview.classList.add('has-video');
        await previewVideo.play();
      } else if (source === 'camera') {
        captureStream = cameraStream;
        await addMixedAudio([microphone], captureStream);
        previewVideo.srcObject = cameraStream;
        previewVideo.muted = true;
        preview.classList.add('has-video');
        await previewVideo.play();
      } else {
        captureStream = await createCombinedStream(screenStream, cameraStream, microphone);
      }

      if (captureStream.getVideoTracks().length === 0) {
        throw new Error('Video oqimi topilmadi. Manbani qayta tanlab ko‘ring.');
      }

      const mimeType = chooseMimeType();
      recorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunks.push(event.data);
      };
      recorder.onerror = (event) => {
        showNotice(`Yozuv xatosi: ${event.error?.message || 'MediaRecorder xatosi'}`, true);
        cleanupCapture();
        recordButton.disabled = false;
        recordButton.classList.remove('is-recording');
        recordButtonText.textContent = 'Yozishni boshlash';
        document.querySelector('#recordButtonIcon').style.borderRadius = '';
        stopButton.disabled = true;
        recordState.classList.remove('recording');
        stateText.textContent = 'Tayyor';
        preview.classList.remove('recording');
      };
      recorder.onstop = finishRecording;
      captureStream.getVideoTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (recorder?.state === 'recording') recorder.stop();
        }, { once: true });
      });
      recorder.start(1000);
      recordButton.disabled = false;
      recordButton.classList.add('is-recording');
      recordButton.setAttribute('aria-label', 'Yozishni to‘xtatish');
      recordButtonText.textContent = 'Yozishni to‘xtatish';
      document.querySelector('#recordButtonIcon').style.borderRadius = '2px';
      stopButton.disabled = false;
      recordState.classList.add('recording');
      stateText.textContent = 'Yozilmoqda';
      preview.classList.add('recording');
      startTimer();
      if (source === 'screen' || source === 'both') {
        screenStream.getVideoTracks()[0]?.addEventListener('ended', stopRecording, { once: true });
      }
    } catch (error) {
      cleanupCapture();
      recordButton.disabled = false;
      showNotice(error.name === 'NotAllowedError'
        ? 'Ruxsat berilmadi. Ekran/kamera ulash so‘rovini qabul qiling va qayta urinib ko‘ring.'
        : `Yozuvni boshlashda xatolik: ${error.message}`, true);
    }
  }

  function stopRecording() {
    if (recorder?.state === 'recording') {
      stopButton.disabled = true;
      recordButton.disabled = true;
      stateText.textContent = 'Saqlanmoqda';
      recorder.stop();
    }
  }

  function finishRecording() {
    stopTimer();
    const mimeType = recorder?.mimeType || 'video/webm';
    const blob = new Blob(recordingChunks, { type: mimeType });
    if (blob.size > 0) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      downloadButton.href = previewUrl;
      const extension = mimeType.includes('webm') ? 'webm' : 'bin';
      downloadButton.download = `capture-studio-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
      savedDetails.textContent = `${formatTime(Date.now() - recordingStart)} · ${(blob.size / (1024 * 1024)).toFixed(1)} MB`;
      savedCard.hidden = false;
    } else {
      showNotice('Yozuv bo‘sh chiqdi. Ekran yoki kamerani qayta ulab urinib ko‘ring.', true);
    }
    cleanupCapture();
    recordButton.disabled = false;
    recordButton.classList.remove('is-recording');
    recordButton.removeAttribute('aria-label');
    recordButtonText.textContent = 'Yozishni boshlash';
    document.querySelector('#recordButtonIcon').style.borderRadius = '';
    stopButton.disabled = true;
    recordState.classList.remove('recording');
    stateText.textContent = 'Tayyor';
    preview.classList.remove('recording');
    previewTime.textContent = '00:00:00';
    showNotice(blob.size > 0
      ? 'Yozuv tayyor. Uni qurilmangizga saqlash uchun “Videoni saqlash” tugmasini bosing.'
      : 'Yozuv tugadi.', false);
  }

  function cleanupCapture() {
    stopTimer();
    const streams = new Set([captureStream, screenStream, cameraStream]);
    streams.forEach((stream) => stream?.getTracks().forEach((track) => track.stop()));
    captureStream = null;
    screenStream = null;
    cameraStream = null;
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch((error) => showNotice(`Audio qurilmasini yopishda xatolik: ${error.message}`, true));
    }
    audioContext = null;
    previewVideo.pause();
    previewVideo.srcObject = null;
    preview.classList.remove('has-video');
    recorder = null;
  }

  recordButton.addEventListener('click', () => {
    if (recorder?.state === 'recording') stopRecording();
    else startRecording();
  });
  stopButton.addEventListener('click', stopRecording);
  micToggle.addEventListener('change', () => { micSelect.disabled = !micToggle.checked; });
  navigator.mediaDevices?.addEventListener?.('devicechange', refreshMicrophones);
  refreshMicrophones();

  if (!window.isSecureContext || !navigator.mediaDevices) {
    showNotice('Bu sahifa brauzerda fayl sifatida ochilgan. Ekran/kamera ruxsati uchun start-capture-studio.cmd faylini ishga tushiring.', true);
  }
})();
