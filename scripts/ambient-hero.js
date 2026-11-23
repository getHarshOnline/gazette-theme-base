import { mountAmbientVideo } from '@base/ambient-video';
import { mountAmbientPoses } from './ambient-poses.js';

// Media lifecycle is shared with every other ambient film. This adapter only binds
// resolved Content media and the workspace's existing playback labels.
export function mount({ element, props = {} }) {
  const wrapper = element.closest('[data-gazette-component]');
  if (props.pose_tracking) return mountAmbientPoses({ wrapper, model: props.pose_tracking });
  return mountAmbientVideo({
    element: wrapper.querySelector('.ambient-hero'),
    source: wrapper.querySelector('.ambient-source a[href]'),
    poster: wrapper.querySelector('.ambient-still img'),
  });
}
