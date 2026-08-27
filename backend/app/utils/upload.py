from fastapi import UploadFile


class UploadSizeExceeded(Exception):
    pass


async def read_upload_limited(file: UploadFile, max_size: int) -> bytes:
    """Read at most ``max_size + 1`` bytes so oversized uploads stop early."""
    chunks: list[bytes] = []
    total = 0

    while total <= max_size:
        chunk = await file.read(min(64 * 1024, max_size + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)

    if total > max_size:
        raise UploadSizeExceeded
    return b"".join(chunks)
