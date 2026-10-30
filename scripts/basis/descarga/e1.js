(() => {
  const out = [];
  const sel = '.et_pb_section, .et_pb_row, .et_pb_column, [class*="et_pb_"][class*="_module"], .et_pb_module';
  const els = [...document.querySelectorAll(sel)];
  for (const c of els) {
    let d = 0; for (let p = c.parentElement; p; p = p.parentElement) if (p.matches(sel)) d++;
    const cl = (c.getAttribute('class') || '').split(/\s+/).filter(x => /^et_pb_|^et_section|^et_pb_with/.test(x) && !/_tb_|_\d+$|^et_pb_css|gutters/.test(x)).slice(0, 4).join('.');
    const r = c.getBoundingClientRect();
    out.push('  '.repeat(d) + c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + ' .' + cl + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' y' + Math.round(r.top + scrollY));
  }
  return out;
})()
