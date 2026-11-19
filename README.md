# SWADE – Combat Tracker estilo Fantasy Grounds

Módulo para el sistema **SWADE**. Funciona en Foundry VTT v13 (SWADE 5.2.6, Better Rolls 2 v4.38, SWADE Tools v4.1) y en Foundry v14 (SWADE 6, Better Rolls 2 v5, SWADE Tools v4.1+); detecta la versión solo. Abre una ventana de combate amplia, inspirada en el Combat Tracker de Savage Worlds en Fantasy Grounds.

## Qué hace

- **Carta de acción** de cada combatiente, sacada de la baraja de acción que tenga elegida el mundo (ajuste de SWADE). Clic en la carta: se abre en grande, en una ventana que se puede redimensionar (recuerda el tamaño). Clic derecho: robar de nuevo (con el diálogo de Benny del sistema). Los seguidores de un grupo muestran la carta de su líder.
- **Heridas y Fatiga como casillas**: clic para marcar hasta ahí; clic otra vez para desmarcar; clic derecho para bajar una.
- **Bennies** (clic: gastar, clic derecho: sumar) y Bennies del DJ en la cabecera.
- **Estados** (Agitado, Aturdido, Distraído, Vulnerable, Derribado, Atado, Enredado…) que se activan con un clic, igual que desde la hoja.
- **En Espera, Actuar antes / después del actual y Pierde turno**, con las mismas reglas que el tracker de SWADE.
- **Grupos**: arrastra un combatiente sobre otro para que lo siga (usa los grupos de combate de SWADE).
- **Ataques y favoritos**: aparecen en la fila los objetos marcados con la estrella en la hoja y, en los PNJ, todas sus armas (como en su pestaña «Gear»). Cada uno tiene botones de tirada, daño, acciones extra y plantillas de área.
- **Tiradas con tu módulo**: con Better Rolls 2 se crea su tarjeta y se sigue su ajuste de clic (tarjeta, diálogo o tirada directa); con SWADE Tools se abre su diálogo de ataque y su tirada de daño; sin ninguno, se usa la tarjeta del sistema.
- **Temas**: Fantasy Grounds, Fantasía, Ciencia ficción, Moderno, Terror y Pulp. El DJ elige el del mundo y cada jugador puede cambiar el suyo.
- **Clic derecho en una fila**: las mismas opciones que el tracker de SWADE en la barra lateral (actualizar participante, agrupar por nombre, hacer líder del grupo, quitar participante, borrar historial de movimiento…), más las del grupo si el combatiente está en uno (editar grupo, borrar grupo, borrar grupo y participantes, permisos). Botón **⋮** en la cabecera con las opciones del encuentro (crear grupo, reiniciar iniciativa…).
- Fila desplegable con Paso (y botón de **tirada de carrera**), Parada y Dureza con el **desglose de modificadores** al pasar el ratón (como en la hoja), los **poderes** del personaje (con sus botones de tirada y daño y las reservas de PP) y los efectos activos con su duración.
- **Desplegar automáticamente** al combatiente que actúa y replegar al anterior al cambiar de turno (ajuste por jugador).
- **Clic derecho en un objeto o efecto** (favoritos, poderes, ventajas, desventajas, acciones…): Recargar, Quitar munición, Mostrar en el chat, Marcar/quitar favorito, Editar, Duplicar y Borrar, como en la hoja.
- **Centrar la vista** en la ficha del combatiente al pasar de turno (ajuste por jugador: nunca, solo cuando yo paso el turno, o siempre), con opción de seleccionarla.

## Compatibilidad

No sustituye el combate del sistema ni el tracker de la barra lateral. Cada botón llama a la función correspondiente de SWADE (`rollInitiative`, `rerollInitiative`, `toggleHold`, `actNow`, `follow`, `toggleActiveEffect`, `spendBenny`, `itemChatCardHelper.handleAction`…), así que Better Rolls 2 y SWADE Tools reciben los mismos hooks que cuando se usa la hoja. Las tiradas de los favoritos se lanzan con las funciones públicas de Better Rolls 2 (`createItemCard`/`create_item_card`, `rollItem`/`roll_item`, `dialog.show_card`, según su versión) o con las clases de SWADE Tools (`ItemDialog`, `SystemRoll`).

## Abrirlo

- Botón **Tracker FG** en la pestaña de combate.
- Atajo **Alt + C**.
- Macro: `game.modules.get("swade-fg-combat-tracker").api.toggle()`
- Se abre solo al empezar el combate (desactivable).
