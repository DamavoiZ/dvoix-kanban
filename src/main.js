// Entry point of the Kanban plugin for dvoix: registers the `.kboard` file
// type. Bundled into a single `main.js` by `npm run build`, because the app
// loads store plugins as one ES module without imports.
import { template } from "./board.js";
import { mountBoard } from "./view.js";

const icon =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/></svg>';

export default {
  onload(dvoix) {
    dvoix.registerFileType({
      id: "kboard",
      label: "Kanban board",
      extensions: ["kboard"],
      icon,
      template,
      mount: mountBoard,
    });
  },

  onunload() {
    // The file type is removed by dvoix itself; nothing else to clean up.
  },
};
