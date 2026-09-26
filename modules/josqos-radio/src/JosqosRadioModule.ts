import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { RadioSnapshot } from './JosqosRadio.types';

declare class JosqosRadioModule extends NativeModule<{}> {
  getRadioInfo(): Promise<RadioSnapshot>;
}

/** null everywhere except a built Android app (Expo Go and iOS do not contain this module). */
export default requireOptionalNativeModule<JosqosRadioModule>('JosqosRadio');
