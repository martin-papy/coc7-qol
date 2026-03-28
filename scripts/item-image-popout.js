Hooks.on('renderItemSheet', (sheet, html, data) => {
  if (game.user.isGM) return;

  const img = html.querySelector('img[data-edit="img"]');
  if (!img) return;

  // Remove data-edit so Foundry's file picker doesn't intercept clicks
  img.removeAttribute('data-edit');
  img.style.cursor = 'pointer';

  img.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    new foundry.applications.apps.ImagePopout({
      src: img.getAttribute('src'),
      window: { title: sheet.object.name }
    }).render(true);
  });
});
