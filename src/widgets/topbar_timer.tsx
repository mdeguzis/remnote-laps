import { renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';

import { TimerBar } from '../ui/TimerBar.tsx';
import { LapsStyle, useOptions } from '../ui/hooks.tsx';
import { useTimer } from '../ui/useTimer.ts';

/**
 * The stopwatch in the top bar.
 *
 * Same component as the in-document pill, so the two can never disagree about
 * what Stop does. The top bar has no document of its own, so it asks the
 * focused pane which Rem is open and starts against that.
 */
function TopBarTimer(): JSX.Element | null {
  const options = useOptions();
  const documentId = useTrackerPlugin(async (plugin) => {
    const paneId = await plugin.window.getFocusedPaneId();
    return await plugin.window.getOpenPaneRemId(paneId);
  }, []);

  // Follows whatever document the focused pane has open, so the top bar always
  // shows the run for what you are actually looking at.
  const timer = useTimer(documentId);

  if (options.timerPlacement === 'document') return null;

  return (
    <>
      <LapsStyle options={options} />
      <TimerBar timer={timer} options={options} documentId={documentId} align="left" />
    </>
  );
}

renderWidget(TopBarTimer);
