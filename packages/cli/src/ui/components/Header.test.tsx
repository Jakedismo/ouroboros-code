/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Header } from './Header.js';
import * as useTerminalSize from '../hooks/useTerminalSize.js';
import { longAsciiLogo } from './AsciiArt.js';
import { renderWithProviders } from '../../test-utils/render.js';

vi.mock('../hooks/useTerminalSize.js');

describe('<Header />', () => {

  it('renders the long logo on a wide terminal', () => {
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 20,
    });
    const { lastFrame } = renderWithProviders(
      <Header version="1.0.0" nightly={false} />,
    );
    expect(lastFrame()).toContain(longAsciiLogo);
  });

  it('renders custom ASCII art when provided', () => {
    const customArt = 'CUSTOM ART';
    const { lastFrame } = renderWithProviders(
      <Header version="1.0.0" nightly={false} customAsciiArt={customArt} />,
    );
    expect(lastFrame()).toContain(customArt);
  });

  it('displays the version number when nightly is true', () => {
    const { lastFrame } = renderWithProviders(
      <Header version="1.0.0" nightly={true} />,
    );
    expect(lastFrame()).toContain('v1.0.0');
  });

  it('does not display the version number when nightly is false', () => {
    const { lastFrame } = renderWithProviders(
      <Header version="1.0.0" nightly={false} />,
    );
    expect(lastFrame()).not.toContain('v1.0.0');
  });
});
