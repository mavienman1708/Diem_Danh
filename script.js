// ============================
// BIẾN TOÀN CỤC
// ============================

let scannedStudents = {};
let lastScanTime = 0;

let html5QrCode;
let scanning = false;
let scanLocked = false;

// link Google Sheet Web App
const sheetURL =
  "https://script.google.com/macros/s/AKfycbwqaGL7wjUOKY3mAZrFoIQkBmsURWi6v9FF9DGngg_TABqM_JXGfonfqs9hF46GyF7_CA/exec";

// ============================
// TEST MODE
// ============================

// Đặt thành true để bật panel test ở góc màn hình
const TEST_MODE_ENABLED = true;

// Biến lưu ca đang override (null = dùng giờ thật)
let testSessionOverride = null;

// ============================
// CONFIG CA HỌC
// ============================

const SESSION_CONFIG = [
  {
    id: "CN1",
    label: "CN Ca 1",
    day: 0,
    startH: 6,
    startM: 45,
    endH: 9,
    endM: 0,
  },
  {
    id: "CN2",
    label: "CN Ca 2",
    day: 0,
    startH: 9,
    startM: 15,
    endH: 10,
    endM: 45,
  },
  {
    id: "T3",
    label: "Thứ 3",
    day: 2,
    startH: 17,
    startM: 30,
    endH: 19,
    endM: 0,
  },
  {
    id: "T5",
    label: "Thứ 5",
    day: 4,
    startH: 17,
    startM: 0,
    endH: 19,
    endM: 0,
  },
];

function getCurrentSession() {
  // Nếu test mode đang override → dùng luôn
  if (testSessionOverride) return testSessionOverride;

  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  for (const s of SESSION_CONFIG) {
    if (
      s.day === day &&
      time >= s.startH * 60 + s.startM &&
      time <= s.endH * 60 + s.endM
    ) {
      return s.id;
    }
  }
  return null;
}

// ============================
// DATABASE HỌC SINH (LOCAL)
// ============================

let studentDB = {};

const CACHE_KEY = "studentDB_cache";
const CACHE_TIME_KEY = "studentDB_cache_time";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 tiếng

async function loadStudentDB() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
    if (
      cached &&
      cachedTime &&
      Date.now() - parseInt(cachedTime) < CACHE_DURATION
    ) {
      studentDB = JSON.parse(cached);
      console.log(
        "Đã tải từ cache:",
        Object.keys(studentDB).length,
        "học sinh",
      );
      return;
    }
  } catch (e) {
    console.log("Cache lỗi, sẽ fetch mới");
  }

  console.log("Đang tải danh sách học sinh...");
  try {
    const res = await fetch(sheetURL + "?type=getAll");
    const arr = await res.json();

    studentDB = {};
    arr.forEach((s) => {
      const tenThanh = s.tenThanh ? s.tenThanh + " " : "";
      studentDB[s.id] = {
        hoTen: s.hoTen,
        tenThanh: s.tenThanh,
        idName: tenThanh + s.hoTen,
      };
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify(studentDB));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    console.log("Đã tải:", Object.keys(studentDB).length, "học sinh");
  } catch (err) {
    console.error("Lỗi tải danh sách:", err);
  }
}

function refreshDB() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
  } catch (e) {}
  loadStudentDB().then(() => showNotify("🔄 Đã làm mới danh sách"));
}

// ============================
// KHOÁ / MỞ UI THEO CA
// ============================

function updateSessionStatus() {
  const session = getCurrentSession();
  const banner = document.getElementById("offHourBanner");
  const sessionBadge = document.getElementById("sessionBadge");

  if (session) {
    // Trong giờ → ẩn banner, mở UI
    if (banner) banner.style.display = "none";

    const cfg = SESSION_CONFIG.find((s) => s.id === session);
    const label = cfg ? cfg.label : session;
    if (sessionBadge) {
      sessionBadge.textContent = "🟢 Ca " + label + " (" + session + ")";
      sessionBadge.className = "session-badge open";
    }

    document.getElementById("scanBtn").disabled = false;
    document.getElementById("manualInput").disabled = false;
  } else {
    // Ngoài giờ → hiện banner, khoá UI
    // Dừng camera nếu đang chạy
    if (scanning && html5QrCode) {
      html5QrCode.stop().catch(() => {});
      scanning = false;
      document.getElementById("scanBtn").innerText = "Bật Camera";
      document.querySelector(".scan-frame").style.display = "none";
    }

    document.getElementById("scanBtn").disabled = true;
    document.getElementById("manualInput").disabled = true;

    if (sessionBadge) {
      sessionBadge.textContent = "🔴 Ngoài giờ";
      sessionBadge.className = "session-badge closed";
    }

    if (banner) {
      const nextInfo = getNextSessionInfo();
      banner.style.display = "block";
      banner.innerHTML =
        "🔒 Đang không trong thời gian điểm danh" +
        (nextInfo ? "<br><small>" + nextInfo + "</small>" : "");
    }
  }
}

function getNextSessionInfo() {
  const now = new Date();
  const day = now.getDay();
  const time = now.getHours() * 60 + now.getMinutes();

  // Tìm ca tiếp theo trong tuần (tính từ hôm nay)
  for (let d = 0; d <= 7; d++) {
    const checkDay = (day + d) % 7;
    for (const s of SESSION_CONFIG) {
      if (s.day !== checkDay) continue;
      const startTime = s.startH * 60 + s.startM;
      if (d === 0 && startTime <= time) continue; // đã qua hôm nay
      const dayNames = [
        "CN",
        "Thứ 2",
        "Thứ 3",
        "Thứ 4",
        "Thứ 5",
        "Thứ 6",
        "Thứ 7",
      ];
      return (
        "Ca tiếp: " +
        s.label +
        " (" +
        dayNames[checkDay] +
        " " +
        pad(s.startH) +
        ":" +
        pad(s.startM) +
        ")"
      );
    }
  }
  return "";
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

// Cập nhật mỗi phút
setInterval(updateSessionStatus, 60 * 1000);

// ============================
// TEST MODE PANEL
// ============================

function initTestPanel() {
  if (!TEST_MODE_ENABLED) return;

  const panel = document.getElementById("testPanel");
  if (!panel) return;
  panel.style.display = "block";

  // Tạo nút cho mỗi ca
  const btnContainer = document.getElementById("testSessionBtns");
  SESSION_CONFIG.forEach((s) => {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.className = "test-btn";
    btn.onclick = () => setTestSession(s.id, btn);
    btnContainer.appendChild(btn);
  });

  // Nút "Giờ thật"
  const realBtn = document.createElement("button");
  realBtn.textContent = "Giờ thật";
  realBtn.className = "test-btn test-btn-real";
  realBtn.onclick = () => setTestSession(null, realBtn);
  btnContainer.appendChild(realBtn);
}

function setTestSession(sessionID, clickedBtn) {
  testSessionOverride = sessionID;

  // Reset màu tất cả nút test
  document
    .querySelectorAll(".test-btn")
    .forEach((b) => b.classList.remove("active"));
  if (clickedBtn) clickedBtn.classList.add("active");

  // Reset danh sách khi đổi ca (tuỳ chọn — xoá nếu không muốn)
  if (sessionID !== null) {
    scannedStudents = {};
    document.getElementById("scanList").innerHTML = "";
    document.getElementById("count").textContent = "0";
  }

  updateSessionStatus();
  if (sessionID) showNotify("🧪 Test ca: " + sessionID);
}

// ============================
// HÀM TÍNH KHỐI TỪ ID
// ============================

function getGradeFromID(studentID) {
  const yearPrefix = parseInt(studentID.substring(0, 2));
  const birthYear = 2000 + yearPrefix;
  const grade = new Date().getFullYear() - birthYear - 6;
  return grade;
}

// ============================
// HÀM HIỂN THỊ THÔNG BÁO
// ============================

function showNotify(message) {
  const notify = document.getElementById("notify");
  notify.textContent = message;
  notify.classList.add("show");
  scanLocked = true;
  setTimeout(() => {
    notify.classList.remove("show");
    scanLocked = false;
  }, 2000);
}

// ============================
// HÀM KIỂM TRA ĐỊNH DẠNG QR
// ============================

function isValidQR(text) {
  return /^[0-9]{5}-.+/.test(text);
}

// ============================
// HÀM THÊM VÀO DANH SÁCH UI
// ============================

function addToList(studentID, studentName) {
  const li = document.createElement("li");
  li.textContent = studentID + " | " + studentName;
  document.getElementById("scanList").appendChild(li);

  const detailsDropdown = document.querySelector(".dropdown");
  if (detailsDropdown && detailsDropdown.open) {
    detailsDropdown.style.height = detailsDropdown.scrollHeight + "px";
  }

  document.getElementById("count").textContent =
    Object.keys(scannedStudents).length;
}

// ============================
// HÀM GỬI LÊN SHEET
// ============================

function postAttendance(studentID, studentName, session) {
  const grade = getGradeFromID(studentID);
  fetch(sheetURL, {
    method: "POST",
    body: JSON.stringify({ id: studentID, name: studentName, grade, session }),
  }).catch(() => console.log("Sheet error"));
}

// ============================
// HÀM XỬ LÝ QUÉT QR
// ============================

function onScanSuccess(decodedText) {
  if (scanLocked) return;

  const now = Date.now();
  if (now - lastScanTime < 1200) return;
  lastScanTime = now;

  if (!isValidQR(decodedText)) {
    showNotify("❌ Sai định dạng QR");
    return;
  }

  const parts = decodedText.trim().split("-");
  const studentID = parts[0];
  const studentName = parts.slice(1).join("-").normalize("NFC");

  if (scannedStudents[studentID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  scannedStudents[studentID] = studentName;
  addToList(studentID, studentName);

  const cfg = SESSION_CONFIG.find((s) => s.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công");

  postAttendance(studentID, studentName, session);
}

// ============================
// BẬT / TẮT CAMERA
// ============================

function toggleScanner() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  if (!scanning) {
    if (html5QrCode) {
      html5QrCode.clear();
      html5QrCode = null;
    }
    html5QrCode = new Html5Qrcode("reader");

    html5QrCode
      .start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (w, h) => {
            const size = Math.min(w, h) * 0.75;
            return { width: size, height: size };
          },
        },
        onScanSuccess,
      )
      .then(() => {
        scanning = true;
        document.getElementById("scanBtn").innerText = "Tắt Camera";
        document.querySelector(".scan-frame").style.display = "block";
      })
      .catch(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
        if (html5QrCode) {
          html5QrCode.clear();
          html5QrCode = null;
        }
        showNotify("❌ Không thể truy cập camera");
      });
  } else {
    html5QrCode
      .stop()
      .then(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      })
      .catch(() => {
        scanning = false;
        document.getElementById("scanBtn").innerText = "Bật Camera";
        document.querySelector(".scan-frame").style.display = "none";
      });
  }
}

// ============================
// ĐIỂM DANH THỦ CÔNG
// ============================

function manualCheckin() {
  const session = getCurrentSession();
  if (!session) {
    showNotify("🔒 Ngoài giờ điểm danh");
    return;
  }

  const input = document.getElementById("manualInput");
  const value = input.value.trim().replace(/\s+/g, " ").normalize("NFC");

  let foundID = null;
  let foundName = null;

  if (/^[0-9]{5}$/.test(value)) {
    if (studentDB[value]) {
      foundID = value;
      foundName = studentDB[value].idName;
    }
  } else {
    const valueLower = value.toLowerCase().normalize("NFC");
    for (let id in studentDB) {
      const s = studentDB[id];
      const hoTen = s.hoTen.toLowerCase().normalize("NFC");
      const full = (s.tenThanh + " " + s.hoTen).toLowerCase().normalize("NFC");
      if (hoTen === valueLower || full === valueLower) {
        foundID = id;
        foundName = s.idName;
        break;
      }
    }
  }

  input.value = "";
  document.querySelector(".confirmIcon").disabled = true;

  if (!foundID) {
    showNotify("❌ Không tìm thấy thông tin");
    return;
  }
  if (scannedStudents[foundID]) {
    showNotify("⚠️ Đã điểm danh rồi");
    return;
  }

  scannedStudents[foundID] = foundName;
  addToList(foundID, foundName);

  const cfg = SESSION_CONFIG.find((s) => s.id === session);
  const label = cfg ? cfg.label : session;
  showNotify("✅ Điểm danh ca " + label + " thành công"); // ← BUG FIX

  postAttendance(foundID, foundName, session);
}

// ============================
// AUTOCOMPLETE
// ============================

function showSuggestions(value) {
  const list = document.getElementById("suggestions");
  list.innerHTML = "";
  if (value.length < 1) return;

  const valueLower = value.toLowerCase().normalize("NFC");
  const matches = [];

  for (let id in studentDB) {
    const s = studentDB[id];
    const hoTen = s.hoTen.toLowerCase().normalize("NFC");
    const full = (s.tenThanh + " " + s.hoTen).toLowerCase().normalize("NFC");

    if (
      id.startsWith(value) ||
      hoTen.includes(valueLower) ||
      full.includes(valueLower)
    ) {
      matches.push({ id, ...s });
      if (matches.length >= 5) break;
    }
  }

  matches.forEach((m) => {
    const li = document.createElement("li");
    li.textContent = m.id + " | " + m.idName;
    li.addEventListener("click", () => {
      document.getElementById("manualInput").value = m.id;
      list.innerHTML = "";
      manualCheckin();
    });
    list.appendChild(li);
  });
}

// ============================
// KEYBOARD & INPUT EVENTS
// ============================

document
  .getElementById("manualInput")
  .addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      manualCheckin();
    }
  });

const confirmBtn = document.querySelector(".confirmIcon");
document.getElementById("manualInput").addEventListener("input", function () {
  confirmBtn.disabled = this.value.trim() === "";
  showSuggestions(this.value.trim());
});

document.getElementById("manualInput").addEventListener("blur", function () {
  setTimeout(() => {
    document.getElementById("suggestions").innerHTML = "";
  }, 150);
});

// ============================
// DROPDOWN ANIMATION
// ============================

const details = document.querySelector(".dropdown");
const summary = details.querySelector("summary");

summary.addEventListener("click", (e) => {
  e.preventDefault();

  if (!details.open) {
    details.open = true;
    details.classList.add("is-open");
    const endHeight = details.scrollHeight;
    details.style.height = summary.offsetHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = endHeight + "px";
    });
  } else {
    details.classList.remove("is-open");
    details.style.height = details.scrollHeight + "px";
    requestAnimationFrame(() => {
      details.style.height = summary.offsetHeight + "px";
    });
    details.addEventListener("transitionend", function handler() {
      details.open = false;
      details.removeEventListener("transitionend", handler);
    });
  }
});

// ============================
// KHỞI ĐỘNG
// ============================

loadStudentDB();
updateSessionStatus();
initTestPanel();
