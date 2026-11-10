export function loadViews(names) {
  return names.map(async name => {
    const response = await fetch(`/views/${name}.html`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load view: ${name}`);
    return response.text();
  });
}
