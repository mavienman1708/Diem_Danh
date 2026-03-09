// =======================
// BIẾN TOÀN CỤC
// =======================

let scannedStudents = {};
let lastScanTime = 0;

let html5QrCode;
let scanning = false;

const sheetURL = "https://script.google.com/macros/s/AKfycbyHfClQ_1Hvg2bL7gcQ8-bacc_Bv1vkK5VrnrarfcngBuJ3C4y0utM8Fo9HOgXv37kQzw/exec";


// =======================
// XỬ LÝ QR
// =======================

function onScanSuccess(decodedText){

let now = Date.now();
if(now - lastScanTime < 1500) return;
lastScanTime = now;

if(!/^[0-9]{5}-[\p{L}\s]+$/u.test(decodedText)){
alert("❌ QR không đúng định dạng (ID-HọTên)");
return;
}

let parts = decodedText.split("-");
let studentID = parts[0];
let studentName = parts[1];

if(scannedStudents[studentID]){

if(scannedStudents[studentID] !== studentName){
alert("❌ ID này đã được dùng cho tên khác");
return;
}

alert("⚠️ Mã này đã điểm danh rồi");
return;
}

scannedStudents[studentID] = studentName;

let li = document.createElement("li");
li.textContent = studentID + " | " + studentName;
document.getElementById("scanList").appendChild(li);

document.getElementById("count").textContent =
Object.keys(scannedStudents).length;

fetch(sheetURL,{
method:"POST",
body:JSON.stringify({
id:studentID,
name:studentName,
time:new Date().toLocaleString()
})
});

fetch(sheetURL,{
method:"POST",
body:JSON.stringify({
id:studentID,
name:studentName,
time:new Date().toLocaleString()
})
});

// log tổng số đã điểm danh hôm nay
let today = new Date().toLocaleDateString();
let totalToday = Object.keys(scannedStudents).length;

console.log("📊 Điểm danh ngày", today, "- Tổng:", totalToday);

}

function onScanFailure(error){}


// =======================
// START CAMERA
// =======================

function startScanner(){

if(!html5QrCode){
html5QrCode = new Html5Qrcode("reader");
}

html5QrCode.start(
{ facingMode: { exact:"environment" } }, // ép camera sau
{
fps:10,
qrbox:250
},
onScanSuccess,
onScanFailure
).then(()=>{

scanning = true;
document.getElementById("scanBtn").innerText = "Stop Scan";

}).catch(()=>{

// fallback nếu exact không hoạt động
html5QrCode.start(
{ facingMode:"environment" },
{ fps:10, qrbox:250 },
onScanSuccess
).then(()=>{

scanning = true;
document.getElementById("scanBtn").innerText = "Stop Scan";

});

});

}


// =======================
// STOP CAMERA
// =======================

function stopScanner(){

if(html5QrCode){
html5QrCode.stop();
}

scanning = false;
document.getElementById("scanBtn").innerText = "Start Scan";

}


// =======================
// NÚT START / STOP
// =======================

function toggleScanner(){

if(scanning){
stopScanner();
}else{
startScanner();
}

}