import validator from 'validator';

const SERVICES = new Set(['Software development', 'AI services', 'Fintech services', 'Testing & quality assurance', 'MVP & product launch', 'Automation & integrations', 'Cloud & DevOps', 'Data & analytics', 'Security engineering', 'Support & dedicated teams', 'GCC & Dedicated Pods', 'Recruitment', 'Products & Platforms', 'Product: Influencer Marketing Campaign Management', 'Product: Auto DM', 'Product: Voice Agent', 'Product: Shoppr', 'Product: FIXLY', 'Not sure yet']);
const STAGES = new Set(['', 'Startup', 'Small business', 'Growing enterprise', 'Established enterprise']);
const FIELDS = new Set(['name', 'company', 'email', 'service', 'interest', 'message', 'consent', 'website', 'request_id', 'turnstile_token', 'campaign']);
const UTM = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function validateLead(body) {
  const errors = {}, data = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { data: null, errors: { form: 'Enter valid enquiry details.' } };
  if (Object.keys(body).some(key => !FIELDS.has(key))) errors.form = 'Unexpected form fields. Please reload and try again.';
  for (const [name, min, max] of [['name', 1, 100], ['company', 1, 160], ['email', 3, 254], ['message', 10, 3000]]) {
    const value = typeof body[name] === 'string' ? body[name].trim() : '';
    const controls = name === 'message' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
    if (value.length < min || value.length > max || controls.test(value)) errors[name] = name === 'message' ? 'Enter a message between 10 and 3,000 characters.' : `Enter a valid ${name}.`;
    data[name] = value;
  }
  if (!validator.isEmail(data.email, { allow_utf8_local_part: false, require_tld: true, allow_ip_domain: false })) errors.email = 'Enter a valid email address, such as name@company.com.';
  data.service = typeof body.service === 'string' ? body.service.trim() : '';
  if (!SERVICES.has(data.service)) errors.service = 'Select a service.';
  data.interest = typeof body.interest === 'string' ? body.interest.trim() : '';
  if (!STAGES.has(data.interest)) errors.interest = 'Select a valid business stage.';
  data.consent = body.consent === true || body.consent === 'on' || body.consent === 'true';
  if (!data.consent) errors.consent = 'Please agree to be contacted about this enquiry.';
  if (body.website !== undefined && (typeof body.website !== 'string' || body.website.trim())) errors.form = 'Your enquiry could not be accepted. Please email hello@cosmonet.ai.';
  const requestId = typeof body.request_id === 'string' ? body.request_id.toLowerCase() : '';
  if (!UUID.test(requestId)) errors.form = 'Please reload the page and try again.';
  const captchaToken = typeof body.turnstile_token === 'string' ? body.turnstile_token : '';
  if (captchaToken.length > 2048) errors.form = 'Please complete verification again.';
  data.campaign = {};
  if (body.campaign !== undefined && (!body.campaign || typeof body.campaign !== 'object' || Array.isArray(body.campaign))) errors.form = 'Invalid campaign information.';
  else for (const key of [...UTM].sort()) {
    const value = body.campaign?.[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) errors.form = 'Invalid campaign information.';
    else data.campaign[key] = value;
  }
  return { data, errors, requestId, captchaToken };
}
