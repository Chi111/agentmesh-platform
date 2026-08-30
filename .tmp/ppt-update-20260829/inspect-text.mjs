import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = process.argv[2] ?? "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-demo.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const inspected = await presentation.inspect({
  kind: "slide,textbox",
  include: "id,slide,name,title,text,textPreview,textChars,textLines,bbox,bboxUnit",
  exclude: "preview,comments",
  search: process.argv[3],
  maxChars: 200000,
});
process.stdout.write(inspected.ndjson ?? "");
