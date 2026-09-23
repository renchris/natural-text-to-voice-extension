/**
 * Builds the <optgroup>/<option> nodes for a voice <select> from the
 * catalogue, grouped by accent and gender. Labels come from the catalogue
 * and are set with textContent, never innerHTML.
 */

import { groupVoiceIds } from './voices';

export function buildVoiceOptionNodes(ids: Iterable<string>): HTMLOptGroupElement[] {
  return groupVoiceIds(ids).map(({ group, voices }) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const v of voices) {
      const option = document.createElement('option');
      option.value = v.id;
      option.textContent = v.name;
      option.setAttribute('aria-label', `${group.label}: ${v.name}`);
      optgroup.appendChild(option);
    }
    return optgroup;
  });
}
