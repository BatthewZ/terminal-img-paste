(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const dropZone = document.getElementById('drop-zone');
  const statusEl = document.getElementById('status');

  const IMAGE_TYPES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/bmp',
    'image/webp',
    'image/svg+xml',
  ];

  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

  let statusTimer = null;

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status-message ' + (type || '');
    dropZone.classList.remove('success', 'error');
    if (type) {
      dropZone.classList.add(type);
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () {
      statusEl.textContent = '';
      statusEl.className = 'status-message';
      dropZone.classList.remove('success', 'error');
    }, 3000);
  }

  function showProcessing() {
    statusEl.innerHTML = '<span class="spinner"></span> Processing...';
    statusEl.className = 'status-message';
  }

  function isImageType(type) {
    return IMAGE_TYPES.indexOf(type) !== -1;
  }

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');

    var files = [];
    var items = e.dataTransfer && e.dataTransfer.items;
    var fileList = e.dataTransfer && e.dataTransfer.files;

    if (items && items.length > 0) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.kind === 'file') {
          var file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
    } else if (fileList && fileList.length > 0) {
      for (var j = 0; j < fileList.length; j++) {
        files.push(fileList[j]);
      }
    }

    if (files.length === 0) {
      showStatus('No files detected in drop', 'error');
      return;
    }

    // Validate all files are images and within size limit
    for (var k = 0; k < files.length; k++) {
      if (!isImageType(files[k].type)) {
        showStatus('Only image files are accepted', 'error');
        return;
      }
      if (files[k].size > MAX_SIZE) {
        showStatus('File too large (max 50 MB)', 'error');
        return;
      }
    }

    showProcessing();

    var pending = files.length;
    var results = [];
    var hadError = false;

    for (var m = 0; m < files.length; m++) {
      (function (file) {
        var reader = new FileReader();
        reader.onload = function () {
          if (hadError) return;
          // result is "data:<mime>;base64,<data>"
          var dataUrl = reader.result;
          var base64 = dataUrl.split(',')[1];
          results.push({ name: file.name, data: base64, mimeType: file.type });
          pending--;
          if (pending === 0) {
            vscode.postMessage({ type: 'files-dropped', files: results });
          }
        };
        reader.onerror = function () {
          if (hadError) return;
          hadError = true;
          showStatus('Failed to read file: ' + file.name, 'error');
        };
        reader.readAsDataURL(file);
      })(files[m]);
    }
  });

  // Listen for messages from the extension
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (msg.type === 'drop-result') {
      if (msg.success) {
        showStatus(msg.message || 'Image saved', 'success');
      } else {
        showStatus(msg.message || 'Drop failed', 'error');
      }
    }
  });
})();
