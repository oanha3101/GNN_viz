Để chạy dự án GNN-Insight trên Windows với XAMPP, bạn có thể thực hiện theo
  các bước sau:

  1. Chạy Backend (Python FastAPI)
  Mở một terminal mới (PowerShell hoặc CMD) tại thư mục gốc của dự án:

   1 cd backend
   2 # Kích hoạt môi trường ảo
   3 .\venv\Scripts\activate
   4 # Khởi chạy server
   5 python main.py
  Lưu ý: Server Backend mặc định sẽ chạy tại http://localhost:8000.

  2. Chạy Frontend (React + Vite)
  Mở một terminal thứ hai tại thư mục gốc của dự án:

   1 cd frontend
   2 # Chạy ở chế độ development
   3 npm run dev
  Lưu ý: Vite thường sẽ chạy tại http://localhost:5173.

  3. Cấu hình Database (MySQL từ XAMPP)
  Vì bạn dùng XAMPP, MySQL thường chạy ở cổng 3306 (trong khi dự án mặc định để
  3344 cho Docker). Bạn nên kiểm tra hoặc tạo file .env trong thư mục backend/
  với nội dung tương tự sau:

   1 # Thay đổi user/pass và port cho đúng với XAMPP của bạn (thông thường là
     root/không pass và port 3306)
   2 MYSQL_URL=mysql+pymysql://root:@127.0.0.1:3306/gnn_db
   3 MONGO_URI=mongodb://127.0.0.1:27017/
   4 REDIS_URL=redis://127.0.0.1:6379/0

  Một số lệnh hữu ích khác:
   - Kiểm tra kết nối MySQL: Trong thư mục backend, bạn có thể chạy:
    python scratch/test_mysql_connection.py
   - Tạo Database: Hãy đảm bảo bạn đã tạo database tên là gnn_db trong
     phpMyAdmin hoặc MySQL Workbench trước khi chạy.

  Nếu bạn gặp lỗi về môi trường hoặc thiếu thư viện, hãy cho tôi biết nhé!


