import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-demo.pptx";
const output = "/Users/mac/workcode/agentmesh-platform/.tmp/ppt-update-20260829/template-starter.pptx";

const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
const originals = [...presentation.slides.items];

// Artifact Tool cannot export four imported reverse-direction free connectors
// whose bounding boxes use negative widths. Normalize their geometry while
// preserving their left-pointing arrowheads.
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
