/**
 * APLYD - Shop-Floor Form Capture & Preflight Controller
 */

let selectedFile = null;
let currentRotation = 0;
let fileDataUrl = null;
let fileSha256 = null;

document.addEventListener("DOMContentLoaded", () => {
  setupCaptureEvents();
});

function setupCaptureEvents() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const rotateBtn = document.getElementById("rotateBtn");
  const removeFileBtn = document.getElementById("removeFileBtn");
  const extractBtn = document.getElementById("extractBtn");

  if (!dropzone || !fileInput) return;

  // Click dropzone to open file picker / camera
  dropzone.addEventListener("click", () => fileInput.click());

  // Drag and drop events
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  if (rotateBtn) {
    rotateBtn.addEventListener("click", handleRotate);
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", resetCapture);
  }

  if (extractBtn) {
    extractBtn.addEventListener("click", startExtractionPipeline);
  }
}

async function handleFileSelected(file) {
  // Validate file type
  if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
    window.toast?.show("Unsupported file type. Please upload a JPG or PNG image.", "error");
    return;
  }

  // Validate size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    window.toast?.show("File too large. Maximum supported image size is 10 MB.", "error");
    return;
  }

  selectedFile = file;
  currentRotation = 0;

  // Compute SHA-256 for duplicate detection
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  fileSha256 = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  // Read data URL for preview
  const reader = new FileReader();
  reader.onload = async (e) => {
    fileDataUrl = e.target.result;
    renderPreflightCard();
  };
  reader.readAsDataURL(file);
}

async function renderPreflightCard() {
  const dropzone = document.getElementById("dropzone");
  const previewCard = document.getElementById("preflightPreviewCard");
  const thumbImg = document.getElementById("previewImg");
  const fileNameEl = document.getElementById("previewFileName");
  const fileSizeEl = document.getElementById("previewFileSize");
  const fileDimsEl = document.getElementById("previewDimensions");
  const duplicateAlert = document.getElementById("duplicateWarningAlert");
  const extractBtn = document.getElementById("extractBtn");

  if (!previewCard || !thumbImg) return;

  dropzone.classList.add("hidden");
  previewCard.classList.remove("hidden");

  thumbImg.src = fileDataUrl;
  thumbImg.style.transform = `rotate(${currentRotation}deg)`;

  if (fileNameEl) fileNameEl.textContent = selectedFile.name;
  if (fileSizeEl) fileSizeEl.textContent = (selectedFile.size / 1024).toFixed(1) + " KB";

  // Check dimensions
  const imgObj = new Image();
  imgObj.src = fileDataUrl;
  imgObj.onload = () => {
    if (fileDimsEl) fileDimsEl.textContent = `${imgObj.width} × ${imgObj.height} px`;
    if (imgObj.width < 800) {
      window.toast?.show("Low resolution photo. Handwriting recognition works best with >= 1000px width.", "warning");
    }
  };

  // Check for duplicate upload in store
  const existingForm = await window.aplydStore.getFormBySha256(fileSha256);
  if (existingForm) {
    duplicateAlert.classList.remove("hidden");
    duplicateAlert.innerHTML = `⚠️ <strong>Duplicate Warning:</strong> An identical photograph was previously uploaded as form <strong>${existingForm.form_number}</strong> on ${new Date(existingForm.uploaded_at).toLocaleDateString()}. Proceeding will log a new verification record.`;
  } else {
    duplicateAlert.classList.add("hidden");
  }

  if (extractBtn) extractBtn.disabled = false;
}

function handleRotate() {
  currentRotation = (currentRotation + 90) % 360;
  const thumbImg = document.getElementById("previewImg");
  if (thumbImg) {
    thumbImg.style.transform = `rotate(${currentRotation}deg)`;
  }
}

function resetCapture() {
  selectedFile = null;
  fileDataUrl = null;
  fileSha256 = null;
  currentRotation = 0;

  const dropzone = document.getElementById("dropzone");
  const previewCard = document.getElementById("preflightPreviewCard");
  const fileInput = document.getElementById("fileInput");
  const progressSection = document.getElementById("progressSection");
  const failureCard = document.getElementById("failureCard");

  if (fileInput) fileInput.value = "";
  if (previewCard) previewCard.classList.add("hidden");
  if (progressSection) progressSection.classList.add("hidden");
  if (failureCard) failureCard.classList.add("hidden");
  if (dropzone) dropzone.classList.remove("hidden");
}
window.resetCapture = resetCapture;

async function startExtractionPipeline() {
  const previewCard = document.getElementById("preflightPreviewCard");
  const progressSection = document.getElementById("progressSection");
  const failureCard = document.getElementById("failureCard");
  const extractBtn = document.getElementById("extractBtn");

  if (extractBtn) extractBtn.disabled = true;
  if (previewCard) previewCard.classList.add("hidden");
  if (progressSection) progressSection.classList.remove("hidden");

  const setStep = (stepNum) => {
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`step${i}`);
      if (!stepEl) continue;
      if (i < stepNum) {
        stepEl.className = "step-item done";
        stepEl.querySelector(".step-icon").textContent = "✓";
      } else if (i === stepNum) {
        stepEl.className = "step-item active";
      } else {
        stepEl.className = "step-item";
      }
    }
  };

  try {
    // Step 1: Storage
    setStep(1);
    await new Promise(r => setTimeout(r, 600));

    // Persist source form record
    const currentUser = window.aplydStore.getCurrentUser();
    const formRecord = await window.aplydStore.saveProductionForm({
      original_filename: selectedFile.name,
      mime_type: selectedFile.type,
      file_size_bytes: selectedFile.size,
      file_sha256: fileSha256,
      storage_path: `forms/${currentUser.id}/${Date.now()}_${selectedFile.name}`,
      storage_data_url: fileDataUrl, // Saved locally for viewer
      uploaded_by: currentUser.id,
      processing_status: 'processing'
    });

    // Step 2: Boundary & layout analysis
    setStep(2);
    await new Promise(r => setTimeout(r, 700));

    // Step 3: Transcription via Vision AI
    setStep(3);
    const extractionResult = await window.visionExtractor.extractProductionForm({
      file: selectedFile,
      dataUrl: fileDataUrl,
      base64: fileDataUrl.split(',')[1],
      formRecord
    });

    // Step 4: Business rule & master data mapping
    setStep(4);
    await new Promise(r => setTimeout(r, 600));

    // Create draft production record
    const fields = extractionResult.fields;
    const newRecord = await window.aplydStore.saveRecord({
      production_form_id: formRecord.id,
      machine_id: fields.machine_id?.value,
      machine_id_raw: fields.machine_id?.raw_value,
      shift_id: fields.shift?.value,
      shift_raw: fields.shift?.raw_value,
      production_date: fields.production_date?.value,
      production_date_raw: fields.production_date?.raw_value,
      production_quantity: fields.production_quantity?.value,
      production_unit: fields.production_unit?.value || 'metres',
      material_reference: fields.material_reference?.value,
      batch_reference: fields.batch_reference?.value,
      defects_count: fields.defects_count?.value,
      defect_details: fields.defect_details?.value,
      downtime_minutes: fields.downtime_minutes?.value,
      downtime_reason: fields.downtime_reason?.value,
      remarks: fields.remarks?.value,
      final_payload: extractionResult,
      status: 'pending_review',
      validation_status: extractionResult.overall_status === 'needs_review' ? 'warning' : 'pass',
      submitted_by: currentUser.id,
      submitted_by_name: currentUser.full_name
    });

    // Update form processing status
    formRecord.processing_status = 'extracted';
    formRecord.extraction_payload = extractionResult;
    await window.aplydStore.saveProductionForm(formRecord);

    window.toast?.show("Extraction complete! Redirecting to verification console...", "success");

    // Route to verification review console
    setTimeout(() => {
      window.location.href = `review.html?id=${newRecord.id}`;
    }, 800);

  } catch (err) {
    console.error("Extraction error:", err);
    if (progressSection) progressSection.classList.add("hidden");
    if (failureCard) {
      failureCard.classList.remove("hidden");
      const errEl = document.getElementById("failureErrorMsg");
      if (errEl) errEl.textContent = err.message || "An unexpected error occurred during multimodal document parsing.";
    }
  }
}
