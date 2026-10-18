import { createAnthropicModel, StudioModel } from './studio-ai';

// The model the Studio routes use. Tests swap in a fake.
let model: StudioModel | null = null;

export function getStudioModel(): StudioModel {
  model ??= createAnthropicModel();
  return model;
}

export function setStudioModel(next: StudioModel | null) {
  model = next;
}
