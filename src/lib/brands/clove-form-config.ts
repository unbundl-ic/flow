/**
 * Form descriptor types and configs for Clove Dental multi-form support.
 * Used by CloveBrandStrategy for config-driven fill, captcha, and submit.
 */

export type CloveCaptchaTextConfig = {
  type: 'text';
  codeSelector: string;
  inputSelector: string;
};

export type CloveCaptchaImageConfig = {
  type: 'image';
  imageSelector: string;
  inputSelector: string;
  captchaRefreshSelector?: string;
  captchaRefreshWaitMs?: number;
  provider?: 'ocr' | '2captcha';
  apiKey?: string;
};

export type CloveCaptchaConfig = CloveCaptchaTextConfig | CloveCaptchaImageConfig;

export type CloveFormFields = {
  name: { selector: string };
  phone: { selector: string };
  city?: { selector: string };
  disclaimer?: { selector: string };
};

export type CloveFormDescriptor = {
  formId: string;
  url: string | RegExp;
  fields: CloveFormFields;
  captcha: CloveCaptchaConfig;
  submitSelector: string;
  successUrlRegex?: RegExp;
  successSelectors?: string[];
};

export const CLOVE_FORM_IDS = ['clovecontact1', 'speak_to_dentist', 'corporateForm2'] as const;
export type CloveFormId = (typeof CLOVE_FORM_IDS)[number];

const promotionUrlPattern = /clovedental\.in\/promotion\//i;
const corporateUrlPattern = /clovedental\.in.*corporate|dental-camp|corporateForm2/i;

export const CLOVE_FORM_CONFIGS: CloveFormDescriptor[] = [
  {
    formId: 'clovecontact1',
    url: 'https://clovedental.in/promotion/general-dentistry-local-north.php',
    fields: {
      name: { selector: '#name' },
      phone: { selector: '#phone' },
      disclaimer: { selector: '#disclaimer-2' },
    },
    captcha: {
      type: 'image',
      imageSelector: '#page_form #captcha_code1',
      inputSelector: '#page_form #captcha_code',
    },
    submitSelector: '#callme_button',
    successUrlRegex: /thank/i,
    successSelectors: ['.thankyou-page', '#success-message', 'text=Thank you', 'text=Appointment Booked'],
  },
  {
    formId: 'speak_to_dentist',
    url: /speak|dentist|callback|laser-dentistry/i,
    fields: {
      name: { selector: 'input[name="name_r"]' },
      phone: { selector: 'input[name="phone_r"]' },
      city: { selector: '#clinicHeade' },
      disclaimer: { selector: '#disclaimer_r' },
    },
    captcha: {
      type: 'text',
      codeSelector: '#captchaText',
      inputSelector: '#captchaInput',
    },
    submitSelector: 'input[name="submit3"]',
    successUrlRegex: /thank|success/i,
    successSelectors: ['.thankyou-page', 'text=Thank you', 'text=Success'],
  },
  {
    formId: 'corporateForm2',
    url: /clovedental\.in/i,
    fields: {
      name: { selector: '#c_name_id_2' },
      phone: { selector: '#c_phone_2' },
      city: { selector: 'select[name="clinic_city"]' },
    },
    captcha: {
      type: 'image',
      imageSelector: '#captcha_code_corporate',
      inputSelector: '#c_captcha_2',
    },
    submitSelector: '#submitBtnShow2',
    successUrlRegex: /thank|success/i,
    successSelectors: ['.thankyou-page', 'text=Thank you', 'text=Success'],
  },
];

/**
 * Resolve form config by formId or by current page URL.
 * Prefer formId when provided; otherwise match URL against descriptor url (string or RegExp).
 */
export function getCloveFormConfig(
  formIdOrUrl: string | undefined,
  currentUrl?: string
): CloveFormDescriptor | undefined {
  const byId = formIdOrUrl && CLOVE_FORM_IDS.includes(formIdOrUrl as CloveFormId)
    ? CLOVE_FORM_CONFIGS.find((c) => c.formId === formIdOrUrl)
    : undefined;
  if (byId) return byId;

  if (!currentUrl) return CLOVE_FORM_CONFIGS[0];

  for (const config of CLOVE_FORM_CONFIGS) {
    if (typeof config.url === 'string') {
      if (currentUrl === config.url || currentUrl.startsWith(config.url)) return config;
    } else if (config.url instanceof RegExp && config.url.test(currentUrl)) {
      return config;
    }
  }

  if (promotionUrlPattern.test(currentUrl)) return CLOVE_FORM_CONFIGS[0];
  if (corporateUrlPattern.test(currentUrl)) return CLOVE_FORM_CONFIGS[2];

  return CLOVE_FORM_CONFIGS[0];
}
