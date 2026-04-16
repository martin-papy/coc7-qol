Hooks.on('renderItemSheetV2', (application, element, context, options) => {
  if (!(application instanceof foundry.applications.sheets.ItemSheetV2)) return;
  if (game.user.isGM) return;

  const img = element.querySelector('img[data-action="editImage"]');
  if (!img) return;

  // Remove data-action so AppV2's root action dispatcher doesn't intercept clicks
  img.removeAttribute('data-action');
  img.classList.add('item-image-popout-trigger');

  img.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    new foundry.applications.apps.ImagePopout({
      src: img.getAttribute('src'),
      window: { title: application.document.name }
    }).render(true);
  });
});
