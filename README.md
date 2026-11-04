# 🌙 KÝ TÚC XÁ ĐI NGỦ ONLINE - 20 GIƯỜNG NGỦ (TIKTOK LIVE STUDIO UI)

Ứng dụng Interactive Stream Overlay chuyên nghiệp dành cho **TikTok LIVE Studio / OBS Studio** tỷ lệ dọc **9:16 (540x960 / 1080x1920)**.

---

## 🎯 1. TÍNH NĂNG NỔI BẬT

### 🛌 20 Giường Ngủ Thông Minh (4 cột x 5 hàng)
- Mỗi giường hiển thị số thứ tự `#1` - `#20`, gối nằm, nhân vật/avatar nhắm mắt thở nhịp nhàng, chữ `Zzz` bay lên, tên người xem và điểm giữ giường.
- Hệ thống trừ điểm tự nhiên (decay) giúp tạo sự kịch tính và khuyến khích người xem liên tục tương tác.

### 🏆 Hệ Thống Phân Cấp Chiếm Giường (Priority System)
- **Cấp 0 (Member Join):** Lời chào mừng trên Banner và Live Chat.
- **Cấp 1 (Thả Tim / Chúc Ngủ Ngon):** Nhận ngay giường trống, viền Cyan `#38bdf8`, chăn xám xanh cơ bản.
- **Cấp 2 (Follow - Tier 2 Ưu Tiên):** Giường viền Emerald `#10b981` phát sáng, nhãn `⭐ FAN`. Nếu hết giường, tự động **ĐÁ** người Cấp 1 có điểm thấp nhất!
- **Cấp 3 (Tặng Quà VIP - Tier 3 Quyền Tối Thượng):** Giường Hoàng Gia viền vàng rực sáng (`bed-vip-glow`), gắn vương miện `👑 VIP` và hiển thị tổng số xu. Có quyền **ĐÁ BẤT KỲ AI** thấp hơn.

### 🌙 Chức Năng Đặc Biệt: "Chúc Ngủ Ngon" (Goodnight Feature)
- **Tự động bắt từ khóa:** Nhận diện các từ khóa `ngủ ngon`, `chúc ngủ ngon`, `gn`, `good night`, `mơ đẹp`, `ngủ sớm`, `khò khò`...
- **Tương tác giường:**
  * Người đã có giường: `+20 điểm` giữ giường, đắp **hào quang tím mộng mơ (Dreamy Aura)** và bật **bong bóng chat tím ánh sao 🌙** ngay trên đầu giường trong 5 giây.
  * Người chưa có giường: Tự động xếp vào giường trống (Cấp 1) kèm thông báo `"🌙 [Tên] vừa gửi lời chúc ngủ ngon và nhận Giường #X!"`.
- **Hiệu ứng UX/UI:**
  * Thả hạt trăng khuyết 🌙, sao lấp lánh ✨ và mây trắng ☁️ bay lơ lửng từ dưới lên.
  * Tin nhắn trong Live Chat được đóng khung **viền tím Neon phát sáng** rực rỡ.
- **Âm thanh & Giọng đọc AI:**
  * Web Audio API: Giai điệu hộp nhạc ru ngủ (Lullaby Chime 3 nốt) êm dịu, không cần load file mp3 ngoài.
  * Web Speech API: Tự động đọc tiếng Việt `vi-VN`: `"Cảm ơn [Tên người xem] đã chúc cả ký túc xá ngủ ngon nhé!"`.
- **Mục tiêu cộng đồng 25/25 lời chúc:**
  * Khi đạt 25 lời chúc: Kích hoạt **"🌌 MƯA SAO BĂNG CHÚC NGỦ NGON"** toàn màn hình 8 giây, phát nhạc Lullaby đặc biệt và cộng `+30 điểm bảo vệ giường` cho toàn bộ 20 người đang nằm!

### 🎛️ Bảng Điều Khiển & Giả Lập Đầy Đủ
- Phím tắt **H**: Ẩn/Hiện Bảng Điều Khiển và chuyển nền sang trong suốt (`background: transparent`) dành riêng cho OBS / TikTok Studio.
- Auto-Simulator thông minh (tự động mô phỏng người vào, thả tim, follow, tặng quà và chúc ngủ ngon mỗi 2.5s khi chưa bật server).
- Nút bấm test chuyên biệt: **"🌙 Test Chúc Ngủ Ngon"** và **"🌌 Kích Hoạt Mưa Sao Băng"**.

---

## 🚀 2. CÁCH KHỞI CHẠY

### Cách 1: Mở Trực Tiếp Không Cần Cài Đặt
- Nhấp đúp vào file [`index.html`](file:///C:/Users/canh/Desktop/tool-ngu-online/index.html) để mở ngay trên trình duyệt (Chrome, Edge, Cốc Cốc).
- Ứng dụng chạy độc lập 100% với bộ Auto-Simulator và Web Audio / Web Speech API.

### Cách 2: Chạy Với Server Node.js (Có Hỗ Trợ TikTok Live Thật)
1. Mở terminal tại thư mục dự án và chạy:
   ```bash
   npm start
   # hoặc nhấp đúp vào file start.bat
   ```
2. Truy cập: `http://localhost:3000/`

---

## 📺 3. CÁCH THÊM VÀO OBS STUDIO / TIKTOK LIVE STUDIO

1. Mở **OBS Studio** hoặc **TikTok LIVE Studio**.
2. Thêm nguồn **Browser Source** (Trình duyệt):
   - **URL:** `http://localhost:3000/` (hoặc đường dẫn tới file `index.html`)
   - **Chiều rộng (Width):** `540` (hoặc `1080`)
   - **Chiều cao (Height):** `960` (hoặc `1920`)
3. Bấm phím **H** (hoặc nút "Ẩn Panel") để ẩn bảng điều khiển và tận hưởng màn hình stream 9:16 trong suốt hoàn hảo!
