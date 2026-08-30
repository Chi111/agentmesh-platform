import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-demo-20260829.pptx";
const output = "/Users/mac/workcode/agentmesh-platform/.tmp/roadshow-20260830/ppt/template-starter.pptx";

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const originals = [...presentation.slides.items];

// Imported reverse-direction connectors use negative widths. Normalize their
// geometry so Artifact Tool can re-export them without changing arrow intent.
for (const slide of originals) {
  for (const shape of slide.shapes.items) {
    const position = shape.position;
    if (!position || (position.width >= 0 && position.height >= 0)) continue;
    shape.position = {
      left: position.width < 0 ? position.left + position.width : position.left,
      top: position.height < 0 ? position.top + position.height : position.top,
      width: Math.abs(position.width),
      height: Math.abs(position.height),
      horizontalFlip: position.width < 0,
      verticalFlip: position.height < 0,
    };
    if (position.width < 0) {
      shape.connectorHead = { type: "none" };
      shape.connectorTail = { type: "triangle", width: "sm", length: "sm" };
    }
  }
}

const duplicated = originals.map((slide) => slide.duplicate());
for (const slide of originals) slide.delete();
duplicated.forEach((slide, index) => slide.moveTo(index));

const blob = await PresentationFile.exportPptx(presentation);
await blob.save(output);
console.log(JSON.stringify({ output, slideCount: duplicated.length }));
