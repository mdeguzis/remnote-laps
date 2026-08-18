import { WidgetLocation, renderWidget, useTrackerPlugin } from '@remnote/plugin-sdk';

import { TimerBar } from '../ui/TimerBar.tsx';
import { LapsStyle, useOptions } from '../ui/hooks.tsx';
import { useDragPosition } from '../ui/useDragPosition.ts';
import { useTimer } from '../ui/useTimer.ts';

/**
 * The stopwatch inside a document.
 *
 * RemNote drops the plugin container in normal flow directly after
 * `.rn-doc-header`, a full row below the title, and there is no widget location
 * inside that row. The lifted placements move the container up into it from the
 * host side with `registerCSS`; see `lib/hostcss.ts` for the markup targeted and
 * for why that slot is a fixed width rather than a measured one.
 */
function DocumentTimer(): JSX.Element | null {
  const options = useOptions();
  const drag = useDragPosition();

  const context = useTrackerPlugin(
    async (plugin) => plugin.widget.getWidgetContext<WidgetLocation.DocumentBelowTitle>(),
    [],
  );

  // Scoped to THIS document, so a document that has never been timed shows a
  // fresh stopwatch even while another one is still counting.
  const timer = useTimer(context?.documentId);

  // Both stopwatch surfaces are always registered, and each hides itself
  // according to the placement setting. Deciding at registration time instead
  // would need a reload every time the user changed their mind.
  if (options.timerPlacement === 'topbar') return null;
  if (!context?.documentId) return null;

  const lifted = options.pillAlign === 'under' || options.pillAlign === 'inline';

  // The host gives the lifted slot a fixed width, so the row right-aligns
  // inside it. That is what puts the idle pill and the open controls against
  // the same edge, rather than the pill floating in a slot sized for the
  // controls.
  const align = lifted ? 'right' : options.pillAlign;

  return (
    <>
      <LapsStyle options={options} />
      <TimerBar timer={timer} options={options} documentId={context.documentId} align={align} drag={drag} />
    </>
  );
}

renderWidget(DocumentTimer);
