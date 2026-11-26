import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Select } from '../../components/ui';
import { useCampaign } from './useCampaign';

/** Sits at the top of every DM page: which campaign you're in, and a quick switch. `actions` sit at the far right. */
export function CampaignBar({ actions }: { actions?: ReactNode }) {
  const { campaigns, campaign, select } = useCampaign();
  const onCampaignsPage = useLocation().pathname === '/campaigns';
  if (!campaigns || !campaign) return null;
  return (
    <div className="border-b border-stone-800/70 bg-stone-900/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-[calc(1rem+var(--nav-button-space,0px))] pr-4 text-sm">
        <Link
          to="/campaigns"
          className="text-xs font-semibold uppercase tracking-wider text-stone-500 hover:text-amber-300"
        >
          Campaign
        </Link>
        {campaigns.length > 1 ? (
          <Select
            aria-label="Current campaign"
            value={campaign.id}
            onChange={(e) => select(e.target.value)}
            className="max-w-64 py-1 font-display font-semibold text-amber-300"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || 'Untitled'}
              </option>
            ))}
          </Select>
        ) : (
          <Link to="/campaigns" className="font-display font-semibold text-amber-300 hover:text-amber-200 hover:underline">
            {campaign.name || 'Untitled'}
          </Link>
        )}
        {campaign.description && (
          <span className="hidden min-w-0 flex-1 truncate text-xs text-stone-500 md:inline">{campaign.description}</span>
        )}
        {!onCampaignsPage && (
          <Link to="/campaigns" className="ml-auto text-xs text-stone-400 hover:text-amber-300">
            {campaigns.length > 1 ? 'Manage campaigns' : 'New campaign'}
          </Link>
        )}
        <div className={`${onCampaignsPage ? 'ml-auto ' : ''}flex items-center gap-2`}>{actions}</div>
      </div>
    </div>
  );
}
