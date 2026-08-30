import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const source = "/Users/mac/workcode/agentmesh-platform/docs/pinme-mesh-demo.pptx";
const presentation = await PresentationFile.importPptx(await FileBlob.load(source));
for (const [slideIndex, slide] of presentation.slides.items.entries()) {
  for (const [shapeIndex, shape] of slide.shapes.items.entries()) {
    const position = shape.position;
    if (position && (position.width < 0 || position.height < 0)) {
      console.log(JSON.stringify({
        slide: slideIndex + 1,
        shapeIndex,
        keys: Object.keys(shape),
        id: shape.id,
        name: shape.name,
        position,
        data: shape.data,
      }));
    }
  }
}
