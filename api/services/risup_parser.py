"""
.risup 파일 파서

디코딩 파이프라인:
  1. RPack decode  (512바이트 룩업 테이블로 바이트 치환)
  2. GZIP decompress
  3. MessagePack decode  (outer: {presetVersion, type, preset})
  4. AES-GCM decrypt     (key=SHA-256("risupreset"), iv=12 zero bytes)
  5. MessagePack decode  (inner: 실제 프리셋 데이터)
"""

import gzip
import hashlib
from pathlib import Path
from typing import Any

import msgpack
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_RPACK_MAP_PATH = Path(__file__).parent.parent / "data" / "rpack_map.bin"
_decode_map: bytes | None = None


def _get_decode_map() -> bytes:
    global _decode_map
    if _decode_map is None:
        raw = _RPACK_MAP_PATH.read_bytes()
        if len(raw) != 512:
            raise RuntimeError(f"rpack_map.bin 크기 오류: {len(raw)} (512 필요)")
        _decode_map = raw[256:512]
    return _decode_map


def _rpack_decode(data: bytes) -> bytes:
    dm = _get_decode_map()
    return bytes(dm[b] for b in data)


def _decrypt_buffer(data: bytes, key_string: str) -> bytes:
    key = hashlib.sha256(key_string.encode()).digest()
    iv = bytes(12)  # 12 zero bytes (Web Crypto API 기본값)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, data, None)


def _to_serializable(obj: Any) -> Any:
    """msgpack 결과를 JSON 직렬화 가능한 형태로 변환."""
    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except UnicodeDecodeError:
            return obj.hex()
    if isinstance(obj, dict):
        return {
            (k.decode("utf-8") if isinstance(k, bytes) else k): _to_serializable(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_to_serializable(i) for i in obj]
    return obj


def parse_risup(file_bytes: bytes) -> dict[str, Any]:
    """
    .risup 파일 바이트를 받아 파싱된 프리셋 dict를 반환합니다.
    실패 시 ValueError를 raise합니다.
    """
    # 1. RPack decode
    decoded = _rpack_decode(file_bytes)

    # 2. GZIP decompress
    try:
        decompressed = gzip.decompress(decoded)
    except Exception as e:
        raise ValueError(f"GZIP 압축 해제 실패: {e}") from e

    # 3. MessagePack decode (outer wrapper)
    try:
        outer: dict = msgpack.unpackb(decompressed, raw=False)
    except Exception as e:
        raise ValueError(f"MessagePack 디코딩 실패 (outer): {e}") from e

    if outer.get("type") != "preset":
        raise ValueError(f"프리셋 파일이 아닙니다: type={outer.get('type')!r}")

    preset_version = outer.get("presetVersion", 0)

    # 4. AES-GCM decrypt
    encrypted = outer.get("preset") or outer.get("pres")
    if encrypted is None:
        raise ValueError("암호화된 프리셋 데이터를 찾을 수 없습니다")

    try:
        decrypted = _decrypt_buffer(bytes(encrypted), "risupreset")
    except Exception as e:
        raise ValueError(f"AES-GCM 복호화 실패: {e}") from e

    # 5. MessagePack decode (inner preset)
    try:
        preset: dict = msgpack.unpackb(decrypted, raw=False)
    except Exception as e:
        raise ValueError(f"MessagePack 디코딩 실패 (inner): {e}") from e

    serializable = _to_serializable(preset)
    serializable["_meta"] = {"presetVersion": preset_version}
    return serializable
