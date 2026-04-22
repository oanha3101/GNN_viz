import uuid
from typing import Dict

class SessionManager:
    """
    Quản lý các phiên (sessions) training độc lập.
    Giải quyết vấn đề biến toàn cục _stop_training gây ảnh hưởng chéo giữa các người dùng.
    """
    def __init__(self):
        # Lưu trữ trạng thái dừng theo session_id
        # { "session_id": bool_stop_flag }
        self._active_sessions: Dict[str, bool] = {}

    def create_session(self) -> str:
        """Khởi tạo một phiên mới và trả về ID."""
        session_id = str(uuid.uuid4())
        self._active_sessions[session_id] = False
        return session_id

    def stop_session(self, session_id: str):
        """Đánh dấu dừng cho một phiên cụ thể."""
        if session_id in self._active_sessions:
            self._active_sessions[session_id] = True

    def is_stopped(self, session_id: str) -> bool:
        """Kiểm tra xem phiên có bị yêu cầu dừng hay không."""
        return self._active_sessions.get(session_id, False)

    def cleanup_session(self, session_id: str):
        """Xóa bỏ phiên khỏi bộ nhớ sau khi hoàn thành."""
        if session_id in self._active_sessions:
            del self._active_sessions[session_id]

# Singleton instance
session_manager = SessionManager()
