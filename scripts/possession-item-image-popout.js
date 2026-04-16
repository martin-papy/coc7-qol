Hooks.on('renderActorSheetV2', (application, element) => {
  if (!(application instanceof foundry.applications.sheets.ActorSheetV2)) return;
  if (application.document.type !== 'character') return;

  element.querySelectorAll('.inventory .item-image').forEach((img) => {
    img.classList.add('item-image-popout-trigger');

    img.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const li = img.closest('[data-item-uuid]');
      if (!li) return;

      const item = await fromUuid(li.dataset.itemUuid);
      if (!item) return;

      new foundry.applications.apps.ImagePopout({
        src: item.img,
        window: { title: item.name }
      }).render(true);
    });
  });
});
