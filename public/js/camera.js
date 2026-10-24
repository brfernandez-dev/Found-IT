// "Take photo" for the report forms.
// Phones/tablets: opens the native camera (input capture).
// Desktop: opens a live camera dialog (getUserMedia) and snaps a JPEG.
// Either way the picture is put into the normal <input name="image">,
// so the existing upload code on the server does not change.
(function () {
  var input = document.querySelector('input[type="file"][name="image"]');
  if (!input) return;

  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/css/camera.css';
  document.head.appendChild(css);

  var camInput = document.createElement('input');
  camInput.type = 'file';
  camInput.accept = 'image/*';
  camInput.setAttribute('capture', 'environment');
  camInput.hidden = true;
  input.parentNode.insertBefore(camInput, input.nextSibling);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-camera';
  btn.textContent = '📷 Take photo';

  var control = input.closest('.photo-upload-control');
  if (control) control.appendChild(btn);
  else camInput.parentNode.insertBefore(btn, camInput.nextSibling);

  function setFile(file) {
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  camInput.addEventListener('change', function () {
    if (camInput.files && camInput.files[0]) setFile(camInput.files[0]);
    camInput.value = '';
  });

  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var canStream = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  btn.addEventListener('click', function () {
    if (isTouch || !canStream) camInput.click();
    else openDialog();
  });

  function openDialog() {
    var stream;
    var overlay = document.createElement('div');
    overlay.className = 'cam-overlay';
    overlay.innerHTML =
      '<div class="cam-dialog" role="dialog" aria-modal="true" aria-label="Take a photo">' +
      '<video autoplay playsinline muted></video>' +
      '<p class="cam-error" hidden></p>' +
      '<div class="cam-dialog-actions">' +
      '<button type="button" class="cam-cancel">Cancel</button>' +
      '<button type="button" class="cam-snap">Capture</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    var video = overlay.querySelector('video');
    var err = overlay.querySelector('.cam-error');

    function close() {
      if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
      overlay.remove();
    }

    overlay.querySelector('.cam-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    overlay.querySelector('.cam-snap').addEventListener('click', function () {
      if (!video.videoWidth) return;
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(function (blob) {
        if (blob) setFile(new File([blob], 'camera-' + Date.now() + '.jpg', { type: 'image/jpeg' }));
        close();
      }, 'image/jpeg', 0.9);
    });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (s) { stream = s; video.srcObject = s; })
      .catch(function () {
        err.textContent = 'Camera is not available. Allow camera access or use Upload photo.';
        err.hidden = false;
        overlay.querySelector('.cam-snap').disabled = true;
      });
  }
})();
