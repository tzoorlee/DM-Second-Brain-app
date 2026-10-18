import { createAnthropicModel, StudioMode, StudioModel } from './studio-ai';
import { getStep } from './studio-steps';

// The models the Studio routes use, one per mode. Tests swap in a fake for both.
const models: Partial<Record<StudioMode, StudioModel>> = {};
let override: StudioModel | null = null;

export function getStudioModel(mode: StudioMode = 'setup'): StudioModel {
  if (override) return override;
  return (models[mode] ??= createAnthropicModel(mode));
}

// Preparations and interludes use the 'prep' model, the nine steps the 'setup' one
export const modelForStep = (n: number) => getStudioModel(['prepare', 'interlude'].includes(getStep(n).kind) ? 'prep' : 'setup');

export function setStudioModel(next: StudioModel | null) {
  override = next;
}
