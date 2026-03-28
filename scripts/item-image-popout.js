Hooks.on('renderItemSheet', (sheet, html, data) => {
  if (game.user.isGM) return;

  // html is jQuery in v12, HTMLElement in v13
  const element = html instanceof jQuery ? html[0] : html;
  const img = element.querySelector('img[data-edit="img"]');
  if (!img) return;

  // Remove data-edit so Foundry's file picker doesn't intercept clicks
  img.removeAttribute('data-edit');
  img.style.cursor = 'pointer';

  img.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    const src = img.getAttribute('src');
    const title = sheet.object.name;

    // v13 uses ApplicationV2-style options, v12 uses positional args
    if (foundry.applications?.apps?.ImagePopout) {
      new foundry.applications.apps.ImagePopout({
        src: src,
        window: { title: title }
      }).render(true);
    } else {
      new ImagePopout(src, { title: title }).render(true);
    }
  });
});
