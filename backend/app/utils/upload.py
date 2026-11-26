from fastapi import UploadFile


class UploadSizeExceeded(Exception):
    pass


def read_upload_limited_sync(file: UploadFile, max_size: int) -> bytes:
    """Read at most ``max_size + 1`` bytes so oversized uploads stop early.

    同步版：调用方端点为普通 ``def``（在线程池里执行，评审 M-7），
    不能 ``await``，直接从底层文件对象读取。
    """
    chunks: list[bytes] = []
    total = 0

    while total <= max_size:
        chunk = file.file.read(min(64 * 1024, max_size + 1 - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)

    if total > max_size:
        raise UploadSizeExceeded
    return b"".join(chunks)
