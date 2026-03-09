let scannedStudents = {};
let lastScanTime = 0;

let html5QrCode;
let scanning = false;

function showNotify(message) {
  const notify = document.getElementById("notify");

  notify.textContent = message;
  notify.style.display = "block";

  setTimeout(() => {
    notify.style.display = "none";
  }, 3000);
}

function onScanSuccess(decodedText) {
  let now = Date.now();
  if (now - lastScanTime < 1500) return;
  lastScanTime = now;

  let parts = decodedText.split("-");
  let studentID = parts[0];
  let studentName = parts[1];

  if (scannedStudents[studentID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  scannedStudents[studentID] = studentName;

  let li = document.createElement("li");
  li.textContent = studentID + " | " + studentName;
  document.getElementById("scanList").appendChild(li);

  document.getElementById("count").textContent =
    Object.keys(scannedStudents).length;

  showNotify("✅ Đã quét: " + studentName);
}

function toggleScanner() {
  if (!scanning) {
    html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      onScanSuccess,
    );

    scanning = true;
    document.getElementById("scanBtn").innerText = "Stop Scan";
  } else {
    html5QrCode.stop().then(() => {
      scanning = false;
      document.getElementById("scanBtn").innerText = "Start Scan";
    });
  }
}
