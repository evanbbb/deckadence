// Read physical page size only. Google's exported object layout is never reused.
// Runs in the source editor; poll window.__SOURCE_SIZE.status/result/error.
(() => {
  const id = location.pathname.match(/\/presentation\/d\/([^/]+)/)?.[1];
  if (!id) throw new Error('Open the source Google Slides editor');
  const state = window.__SOURCE_SIZE = { status: 'running' };
  (async () => {
    try {
      const response = await fetch('/presentation/d/' + id + '/export/pptx');
      if (!response.ok) throw new Error('Source size export HTTP ' + response.status);
      const bytes = new Uint8Array(await response.arrayBuffer()), view = new DataView(bytes.buffer), decoder = new TextDecoder();
      let end = bytes.length - 22;
      const lower = Math.max(0, end - 65535);
      while (end >= lower && view.getUint32(end, true) !== 0x06054b50) end--;
      if (end < lower) throw new Error('Unsupported source ZIP directory');
      let at = view.getUint32(end + 16, true);
      const count = view.getUint16(end + 10, true);
      for (let i = 0; i < count; i++) {
        if (view.getUint32(at, true) !== 0x02014b50) throw new Error('Invalid source ZIP directory');
        const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
        const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
        if (name === 'ppt/presentation.xml') {
          const method = view.getUint16(at + 10, true), len = view.getUint32(at + 20, true), local = view.getUint32(at + 42, true);
          const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
          let data = bytes.subarray(start, start + len);
          if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
          else if (method !== 0) throw new Error('Unsupported source ZIP compression');
          // XML attribute reading avoids the editor's TrustedHTML DOMParser requirement.
          const tag = decoder.decode(data).match(/<[^>]*sldSz\b[^>]*>/)?.[0];
          const cx = Number(tag?.match(/\bcx="(\d+)"/)?.[1]), cy = Number(tag?.match(/\bcy="(\d+)"/)?.[1]);
          if (!(cx > 0 && cy > 0)) throw new Error('No source page size');
          state.result = { widthIn: cx / 914400, heightIn: cy / 914400, provenance: 'Google source export page properties' };
          state.status = 'done'; return;
        }
        at += 46 + nameLen + extraLen + commentLen;
      }
      throw new Error('Source has no presentation part');
    } catch (error) { state.status = 'error'; state.error = error.message; }
  })();
  return 'started';
})()
