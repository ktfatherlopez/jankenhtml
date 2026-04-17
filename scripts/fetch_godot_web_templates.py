"""
Fetch Godot web export templates from GitHub releases using HTTP range requests.
Only downloads the web_release.zip entries (~8-10 MB each) instead of
the full export templates archive (~850+ MB).
"""
import urllib.request, struct, zlib, zipfile, io, os, sys

def read_range(url, start, length):
    req = urllib.request.Request(url)
    req.add_header('Range', f'bytes={start}-{start+length-1}')
    resp = urllib.request.urlopen(req, timeout=60)
    chunks = []
    while True:
        chunk = resp.read(262144)  # 256KB chunks
        if not chunk:
            break
        chunks.append(chunk)
    return b''.join(chunks)

def find_web_release_in_tpz(url):
    """Parse the ZIP central directory of a .tpz via range requests."""
    # Get total size
    req = urllib.request.Request(url, method='HEAD')
    r = urllib.request.urlopen(req)
    total = int(r.headers['Content-Length'])
    print(f'  Archive size: {total/1048576:.1f} MB')

    # Read EOCD (last 64KB)
    tail = read_range(url, total - 65536, 65536)
    eocd_pos = tail.rfind(b'PK\x05\x06')
    if eocd_pos < 0:
        raise RuntimeError('No EOCD found')

    cd_size = struct.unpack_from('<I', tail, eocd_pos + 12)[0]
    cd_offset = struct.unpack_from('<I', tail, eocd_pos + 16)[0]

    # Download central directory
    cd = read_range(url, cd_offset, cd_size)

    # Parse entries
    pos = 0
    entries = {}
    while pos < len(cd):
        if cd[pos:pos+4] != b'PK\x01\x02':
            break
        comp_size = struct.unpack_from('<I', cd, pos + 20)[0]
        uncomp_size = struct.unpack_from('<I', cd, pos + 24)[0]
        name_len = struct.unpack_from('<H', cd, pos + 28)[0]
        extra_len = struct.unpack_from('<H', cd, pos + 30)[0]
        comment_len = struct.unpack_from('<H', cd, pos + 32)[0]
        local_offset = struct.unpack_from('<I', cd, pos + 42)[0]
        name = cd[pos+46:pos+46+name_len].decode('utf-8', errors='replace')
        entries[name] = (comp_size, uncomp_size, local_offset)
        pos += 46 + name_len + extra_len + comment_len

    # Find web_release.zip (prefer nothreads if available)
    for target in ['templates/web_nothreads_release.zip', 'templates/web_release.zip']:
        if target in entries:
            print(f'  Found: {target}')
            return entries[target], target

    # List available web entries
    web = {k:v for k,v in entries.items() if 'web' in k.lower()}
    print(f'  Available web entries: {list(web.keys())}')
    raise RuntimeError('No web_release.zip found')

def download_and_extract_entry(url, local_offset, comp_size, dest_dir):
    """Download a single ZIP entry via range request and decompress."""
    # Read local file header
    header = read_range(url, local_offset, 30)
    method = struct.unpack_from('<H', header, 8)[0]
    name_len = struct.unpack_from('<H', header, 26)[0]
    extra_len = struct.unpack_from('<H', header, 28)[0]
    data_offset = local_offset + 30 + name_len + extra_len

    print(f'  Downloading {comp_size/1048576:.1f} MB...')
    raw = read_range(url, data_offset, comp_size)

    if method == 8:  # deflate
        data = zlib.decompress(raw, -15)
    elif method == 0:  # stored
        data = raw
    else:
        raise RuntimeError(f'Unsupported compression method: {method}')

    # data is now the inner ZIP (web_release.zip)
    # Extract its contents
    inner_zip = zipfile.ZipFile(io.BytesIO(data))
    os.makedirs(dest_dir, exist_ok=True)
    for info in inner_zip.infolist():
        if info.is_dir():
            continue
        basename = os.path.basename(info.filename)
        dest = os.path.join(dest_dir, basename)
        with open(dest, 'wb') as f:
            f.write(inner_zip.read(info.filename))
        print(f'    Extracted: {basename} ({os.path.getsize(dest)} bytes)')
    inner_zip.close()

def main():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    configs = [
        {
            'version': '4.2.1',
            'tag': '4.2.1-stable',
            'dest': os.path.join(base, 'engine', 'godot421'),
        },
        {
            'version': '4.4',
            'tag': '4.4-stable',
            'dest': os.path.join(base, 'engine', 'godot44'),
        },
    ]

    for cfg in configs:
        url = f"https://github.com/godotengine/godot/releases/download/{cfg['tag']}/Godot_v{cfg['tag']}_export_templates.tpz"
        print(f"\n=== Godot {cfg['version']} ===")
        print(f'  URL: {url}')

        if os.path.isdir(cfg['dest']) and any(f.endswith('.wasm') for f in os.listdir(cfg['dest'])):
            print(f'  Already downloaded to {cfg["dest"]}, skipping')
            continue

        try:
            (comp_size, uncomp_size, local_offset), entry_name = find_web_release_in_tpz(url)
            download_and_extract_entry(url, local_offset, comp_size, cfg['dest'])
            print(f'  Done! Files in {cfg["dest"]}')
        except Exception as e:
            print(f'  ERROR: {e}')

    print('\nAll done!')

if __name__ == '__main__':
    main()
