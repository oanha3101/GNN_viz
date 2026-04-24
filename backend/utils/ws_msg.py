"""
WebSocket message utilities.
Wraps all outgoing messages in the v3 envelope with gzip compression.
"""
import json
import gzip
import time
from fastapi import WebSocket
from schemas.constants import SCHEMA_VERSION


class SequenceCounter:
    """Monotonic sequence counter per WS session."""
    __slots__ = ('_seq',)

    def __init__(self):
        self._seq = 0

    def next(self) -> int:
        val = self._seq
        self._seq += 1
        return val

    @property
    def current(self) -> int:
        return self._seq


async def send_json_zipped(websocket: WebSocket, data: dict, seq_counter: SequenceCounter = None):
    """
    Nén dữ liệu JSON bằng GZIP trước khi gửi qua WebSocket.
    Wraps data in v3 envelope if not already wrapped.
    
    Args:
        websocket: FastAPI WebSocket connection
        data: Message dict. If missing 'v' key, will be wrapped in envelope.
        seq_counter: Optional SequenceCounter for monotonic seq numbering.
    """
    try:
        # Wrap in v3 envelope if not already present
        if 'v' not in data:
            envelope = {
                'v': SCHEMA_VERSION,
                'type': data.get('type', 'unknown'),
                'ts': int(time.time() * 1000),
                'seq': seq_counter.next() if seq_counter else 0,
            }
            # Move known top-level fields into envelope
            if 'progress' in data:
                envelope['progress'] = data['progress']
            
            # For epoch_snapshot/graph_data/etc: data minus type/progress becomes payload
            payload_data = {k: v for k, v in data.items() 
                          if k not in ('type', 'progress')}
            
            # If there's a 'data' key, that becomes the payload (legacy compat)
            if 'data' in payload_data:
                envelope['payload'] = payload_data['data']
            else:
                envelope['payload'] = payload_data if payload_data else None
            
            data = envelope

        json_str = json.dumps(data)
        compressed_data = gzip.compress(json_str.encode('utf-8'))
        await websocket.send_bytes(compressed_data)
    except Exception as e:
        # Fallback to standard JSON if compression fails
        print(f"WS Compression Error: {e}")
        try:
            await websocket.send_json(data)
        except Exception:
            pass
