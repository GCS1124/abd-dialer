import type { Campaign, Lead } from "../types";

export function normalizeCampaignSourceKey(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.toLowerCase();
}

export function getActiveDialerCampaigns(campaigns: Campaign[]) {
  return [...campaigns]
    .filter((campaign) => campaign.isActive)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveDialerCampaignKey(
  campaigns: Campaign[],
  preferredCampaignKey: string | null | undefined,
) {
  const activeCampaigns = getActiveDialerCampaigns(campaigns);
  const normalizedPreferredKey = normalizeCampaignSourceKey(preferredCampaignKey);
  const matchingPreferredCampaign =
    normalizedPreferredKey
      ? activeCampaigns.find((campaign) => normalizeCampaignSourceKey(campaign.sourceKey) === normalizedPreferredKey) ?? null
      : null;

  if (matchingPreferredCampaign) {
    return matchingPreferredCampaign.sourceKey;
  }

  if (activeCampaigns.length === 1) {
    return activeCampaigns[0].sourceKey;
  }

  return null;
}

export function filterLeadsForDialerCampaign(
  leads: Lead[],
  campaigns: Campaign[],
  queueScope: string,
) {
  const normalizedScope = normalizeCampaignSourceKey(queueScope);
  if (!normalizedScope || normalizedScope === "unselected") {
    return [];
  }

  if (normalizedScope === "default") {
    return leads;
  }

  const matchingCampaign = campaigns.find(
    (campaign) =>
      campaign.isActive &&
      normalizeCampaignSourceKey(campaign.sourceKey) === normalizedScope,
  );

  if (!matchingCampaign) {
    return [];
  }

  return leads.filter(
    (lead) => normalizeCampaignSourceKey(lead.source) === normalizedScope,
  );
}
