export function sanitizeDialPadInput(value: string) {
  return value.replace(/[^\d+*#]/g, "");
}

export function inferDialCountryId(input: {
  callerId?: string | null;
  timezone?: string | null;
}) {
  return "US";
}

export function formatDialNumberForCountry(
  phone: string,
  options: {
    callingCode?: string | null;
    nationalNumberLength?: number | null;
  },
) {
  const dialTarget = sanitizeDialPadInput(phone.trim());
  const dialDigits = dialTarget.replace(/[^\d]/g, "");
  const callingCode = options.callingCode?.replace(/[^\d]/g, "") ?? "";
  const expectedLength = options.nationalNumberLength ?? null;

  if (!dialTarget) {
    return "";
  }

  const hasDialSymbols = /[*#]/.test(dialTarget);

  if (!dialTarget.startsWith("+") && dialDigits.length <= 6) {
    return hasDialSymbols && dialDigits.length > 0 ? dialTarget : "";
  }

  if (!callingCode || !expectedLength) {
    return "";
  }

  const expectedWithCallingCodeLength = expectedLength + callingCode.length;
  if (dialDigits.length === expectedLength) {
    return `+${callingCode}${dialDigits}`;
  }

  if (dialDigits.length === expectedWithCallingCodeLength && dialDigits.startsWith(callingCode)) {
    return `+${dialDigits}`;
  }

  return "";
}

export function formatManualDialNumberForCountry(
  phone: string,
  options: {
    callingCode?: string | null;
    nationalNumberLength?: number | null;
  },
) {
  return formatDialNumberForCountry(phone, options);
}

export function formatDialNumberForSession(
  phone: string,
  options: {
    callerId?: string | null;
    timezone?: string | null;
  },
) {
  void options;
  return formatDialNumberForCountry(phone, {
    callingCode: "1",
    nationalNumberLength: 10,
  });
}
