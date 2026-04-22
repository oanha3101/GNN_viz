import json
import gzip
from fastapi import WebSocket

async def send_json_zipped(websocket: WebSocket, data: dict):
    """
    Nén dữ liệu JSON bằng GZIP trước khi gửi qua WebSocket để giảm nghẽn băng thông.
    Dữ liệu được gửi dưới dạng nhị phân (Binary).
    """
    try:
        json_str = json.dumps(data)
        compressed_data = gzip.compress(json_str.encode('utf-8'))
        await websocket.send_bytes(compressed_data)
    except Exception as e:
        # Fallback to standard JSON if compression fails (though unlikely)
        print(f"WS Compression Error: {e}")
        await websocket.send_json(data)
