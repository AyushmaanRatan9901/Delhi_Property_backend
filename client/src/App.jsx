import { useState } from 'react'

const BASE = '/api/v1/auth'

async function api(method, path, body, token, isForm = false) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (!isForm) headers['Content-Type'] = 'application/json'
  try {
    const r = await fetch(BASE + path, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    })
    return { status: r.status, data: await r.json() }
  } catch (e) {
    return { status: 0, data: { message: e.message } }
  }
}

// ── Shared style constants ────────────────────────────────────────────────────
const c = {
  input: {
    width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
    borderRadius: 6, fontSize: 13, outline: 'none',
  },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' },
  btn: { padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnGray: { padding: '9px 20px', background: '#475569', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  h2: { fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
  desc: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' },
  hr: { border: 'none', borderTop: '1px solid #e2e8f0', margin: '14px 0' },
  tag: { display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600 },
}

// ── Reusable components ───────────────────────────────────────────────────────
function F({ label, ...p }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={c.label}>{label}</label>
      <input style={c.input} {...p} />
    </div>
  )
}

function Sel({ label, opts, ...p }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={c.label}>{label}</label>
      <select style={c.input} {...p}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function Res({ r }) {
  if (!r) return null
  const ok = r.status >= 200 && r.status < 300
  return (
    <div style={{ marginTop: 14, borderRadius: 6, overflow: 'hidden', border: `1px solid ${ok ? '#86efac' : '#fca5a5'}` }}>
      <div style={{ padding: '6px 12px', background: ok ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...c.tag, background: ok ? '#16a34a' : '#dc2626', color: '#fff' }}>
          {r.status || 'ERR'}
        </span>
        <span style={{ fontSize: 12, color: ok ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
          {ok ? 'Success' : r.data?.message || 'Error'}
        </span>
      </div>
      <pre style={{ margin: 0, padding: 12, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f8fafc', color: '#1e293b', maxHeight: 320, overflowY: 'auto' }}>
        {JSON.stringify(r.data, null, 2)}
      </pre>
    </div>
  )
}

function Card({ children }) {
  return <div style={{ background: '#fff', borderRadius: 8, padding: 20, border: '1px solid #e2e8f0' }}>{children}</div>
}

// ── Section components ────────────────────────────────────────────────────────

function SeedAdmin({ token, setToken }) {
  const [f, sf] = useState({ name: '', phone: '', email: '' })
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))
  const submit = async () => {
    const res = await api('POST', '/seed-super-admin', f, token)
    sr(res)
    if (res.data?.data?.token) { setToken(res.data.data.token); localStorage.setItem('token', res.data.data.token) }
  }
  return (
    <Card>
      <h2 style={c.h2}>🌱 Seed Super Admin</h2>
      <p style={c.desc}>One-time setup — only works when no super admin exists in DB. Returns JWT on success.</p>
      <F label="Name" value={f.name} onChange={ch('name')} placeholder="Full name" />
      <F label="Phone" value={f.phone} onChange={ch('phone')} placeholder="10-digit mobile" />
      <F label="Email (optional)" value={f.email} onChange={ch('email')} placeholder="admin@example.com" />
      <button style={c.btn} onClick={submit}>Create Super Admin</button>
      <Res r={r} />
    </Card>
  )
}

function Register({ setToken, goToLogin }) {
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  const [f, sf] = useState({ name: '', phone: '', email: '' })
  const [otp, setOtp] = useState('')
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))

  const submitRegister = async () => {
    const res = await api('POST', '/register', f)
    sr(res)
    if (res.status === 201) setStep(2)
  }

  const submitVerify = async () => {
    const res = await api('POST', '/register/verify-otp', { phone: f.phone, otp })
    sr(res)
    if (res.data?.data?.token) {
      setToken(res.data.data.token)
      localStorage.setItem('token', res.data.data.token)
      setDone(true)
    }
  }

  if (done) return (
    <Card>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <h2 style={{ ...c.h2, textAlign: 'center', marginBottom: 8 }}>Registration Complete!</h2>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Logged in as <strong>{f.name}</strong> — token saved to top bar.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button style={c.btn} onClick={goToLogin}>Go to Login →</button>
          <button style={c.btnGray} onClick={() => { setStep(1); setDone(false); sf({ name: '', phone: '', email: '' }); setOtp(''); sr(null) }}>
            Register Another
          </button>
        </div>
      </div>
    </Card>
  )

  return (
    <Card>
      <h2 style={c.h2}>📝 Field Agent Self-Register</h2>
      <p style={c.desc}>2-step: fill details then verify OTP to complete registration and get logged in.</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {[['1', 'Enter Details'], ['2', 'Verify OTP']].map(([n, label], i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 700,
              background: step > i ? '#16a34a' : step === i + 1 ? '#2563eb' : '#e2e8f0',
              color: step >= i + 1 ? '#fff' : '#94a3b8',
            }}>{step > i + 1 ? '✓' : n}</div>
            <span style={{ fontSize: 12, color: step === i + 1 ? '#2563eb' : '#94a3b8', fontWeight: step === i + 1 ? 600 : 400 }}>
              {label}
            </span>
            {i < 1 && <span style={{ color: '#e2e8f0', margin: '0 2px' }}>→</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          <F label="Name" value={f.name} onChange={ch('name')} placeholder="Full name" />
          <F label="Phone" value={f.phone} onChange={ch('phone')} placeholder="10-digit mobile" />
          <F label="Email (optional — OTP sent here if provided)" value={f.email} onChange={ch('email')} placeholder="agent@example.com" />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button style={c.btn} onClick={submitRegister}>Register & Send OTP</button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Already registered?</span>
            <button onClick={goToLogin} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              Login →
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1d4ed8' }}>
            OTP sent to <strong>{f.phone}</strong>{f.email ? ` & ${f.email}` : ''}
          </div>
          <F
            label="OTP (6 digits)"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            maxLength={6}
            style={{ ...c.input, fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
            onKeyDown={e => e.key === 'Enter' && submitVerify()}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={c.btn} onClick={submitVerify}>Verify & Complete</button>
            <button style={c.btnGray} onClick={() => { setStep(1); sr(null) }}>← Back</button>
          </div>
        </>
      )}

      <Res r={r} />
    </Card>
  )
}

function Login({ setToken, goToRegister }) {
  const [step, setStep] = useState(1)
  const [identifier, setIdentifier] = useState('')
  const [otp, setOtp] = useState('')
  const [r, sr] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSendOTP = async () => {
    if (!identifier) return alert('Enter phone number or email')
    setLoading(true)
    const res = await api('POST', '/send-otp', { identifier })
    setLoading(false)
    sr(res)
    if (res.status === 200) setStep(2)
  }

  const handleVerify = async () => {
    if (!otp) return alert('Enter OTP')
    setLoading(true)
    const res = await api('POST', '/verify-otp', { identifier, otp })
    setLoading(false)
    sr(res)
    if (res.data?.data?.token) {
      setToken(res.data.data.token)
      localStorage.setItem('token', res.data.data.token)
    }
  }

  const reset = () => { setStep(1); setOtp(''); sr(null) }

  return (
    <Card>
      <h2 style={c.h2}>🔐 Login</h2>
      <p style={c.desc}>Works for all roles — Super Admin, Admin, Field Agent, Field Staff, Tele Caller. Enter phone or email, get OTP, done.</p>

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {[['1', 'Enter Phone / Email'], ['2', 'Enter OTP']].map(([n, label], i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 700,
              background: step > i ? '#16a34a' : step === i + 1 ? '#2563eb' : '#e2e8f0',
              color: step >= i + 1 ? '#fff' : '#94a3b8',
            }}>
              {step > i + 1 ? '✓' : n}
            </div>
            <span style={{ fontSize: 12, color: step === i + 1 ? '#2563eb' : '#94a3b8', fontWeight: step === i + 1 ? 600 : 400 }}>
              {label}
            </span>
            {i < 1 && <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <>
          <F
            label="Phone Number or Email"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="9876543210  or  name@email.com"
            onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ ...c.btn, opacity: loading ? 0.7 : 1 }} onClick={handleSendOTP} disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP →'}
            </button>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>New field agent?</span>
            <button onClick={goToRegister} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              Register here →
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#1d4ed8' }}>
            OTP sent to <strong>{identifier}</strong>
            {process.env.NODE_ENV !== 'production' && ' — check the response below (dev mode)'}
          </div>
          <F
            label="OTP (6 digits)"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            maxLength={6}
            style={{ ...c.input, fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button style={{ ...c.btn, opacity: loading ? 0.7 : 1 }} onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : '✅ Verify & Login'}
            </button>
            <button style={c.btnGray} onClick={reset}>← Change</button>
          </div>
        </>
      )}

      <Res r={r} />
    </Card>
  )
}

function MyProfile({ token }) {
  const [r, sr] = useState(null)
  return (
    <Card>
      <h2 style={c.h2}>👤 My Profile</h2>
      <p style={c.desc}>Returns the full profile of the currently logged-in user.</p>
      <button style={c.btn} onClick={async () => sr(await api('GET', '/me', null, token))}>Get My Profile</button>
      <Res r={r} />
    </Card>
  )
}

function UpdateProfile({ token }) {
  const [f, sf] = useState({
    name: '', email: '', alternatePhone: '', designation: '',
    gender: '', dateOfBirth: '', upiId: '',
    street: '', city: '', state: '', pincode: '',
    accountHolderName: '', accountNumber: '', ifscCode: '',
  })
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    const body = {}
    if (f.name) body.name = f.name
    if (f.email) body.email = f.email
    if (f.alternatePhone) body.alternatePhone = f.alternatePhone
    if (f.designation) body.designation = f.designation
    if (f.gender) body.gender = f.gender
    if (f.dateOfBirth) body.dateOfBirth = f.dateOfBirth
    if (f.upiId) body.upiId = f.upiId
    const addr = {}
    if (f.street) addr.street = f.street
    if (f.city) addr.city = f.city
    if (f.state) addr.state = f.state
    if (f.pincode) addr.pincode = f.pincode
    if (Object.keys(addr).length) body.address = addr
    const bank = {}
    if (f.accountHolderName) bank.accountHolderName = f.accountHolderName
    if (f.accountNumber) bank.accountNumber = f.accountNumber
    if (f.ifscCode) bank.ifscCode = f.ifscCode
    if (Object.keys(bank).length) body.bankDetails = bank
    sr(await api('PUT', '/profile', body, token))
  }

  return (
    <Card>
      <h2 style={c.h2}>✏️ Update My Profile</h2>
      <p style={c.desc}>Fill only the fields you want to update — empty fields are ignored.</p>
      <div style={c.grid2}>
        <F label="Name" value={f.name} onChange={ch('name')} />
        <F label="Email" value={f.email} onChange={ch('email')} />
        <F label="Alternate Phone" value={f.alternatePhone} onChange={ch('alternatePhone')} />
        <F label="Designation" value={f.designation} onChange={ch('designation')} />
        <Sel label="Gender" value={f.gender} onChange={ch('gender')} opts={[['', 'Select...'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} />
        <F label="Date of Birth" type="date" value={f.dateOfBirth} onChange={ch('dateOfBirth')} />
        <F label="UPI ID" value={f.upiId} onChange={ch('upiId')} placeholder="name@upi" />
      </div>
      <hr style={c.hr} />
      <p style={{ ...c.label, marginBottom: 8 }}>Address</p>
      <F label="Street" value={f.street} onChange={ch('street')} />
      <div style={c.grid2}>
        <F label="City" value={f.city} onChange={ch('city')} />
        <F label="State" value={f.state} onChange={ch('state')} />
        <F label="Pincode" value={f.pincode} onChange={ch('pincode')} placeholder="6 digits" />
      </div>
      <hr style={c.hr} />
      <p style={{ ...c.label, marginBottom: 8 }}>Bank Details</p>
      <div style={c.grid2}>
        <F label="Account Holder Name" value={f.accountHolderName} onChange={ch('accountHolderName')} />
        <F label="Account Number" value={f.accountNumber} onChange={ch('accountNumber')} />
        <F label="IFSC Code" value={f.ifscCode} onChange={ch('ifscCode')} placeholder="SBIN0001234" />
      </div>
      <button style={c.btn} onClick={submit}>Update Profile</button>
      <Res r={r} />
    </Card>
  )
}

function UploadPhoto({ token }) {
  const [file, setFile] = useState(null)
  const [r, sr] = useState(null)
  const submit = async () => {
    if (!file) return alert('Please select a photo first')
    const fd = new FormData()
    fd.append('photo', file)
    sr(await api('POST', '/profile/photo', fd, token, true))
  }
  return (
    <Card>
      <h2 style={c.h2}>🖼️ Upload Profile Photo</h2>
      <p style={c.desc}>Accepted: JPEG, PNG, WebP — max 2 MB. Replaces any existing photo.</p>
      <div style={{ marginBottom: 12 }}>
        <label style={c.label}>Photo File</label>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files[0])} style={{ marginTop: 4 }} />
      </div>
      {file && <p style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
      <button style={c.btn} onClick={submit}>Upload Photo</button>
      <Res r={r} />
    </Card>
  )
}

function CreateUser({ token }) {
  const [f, sf] = useState({ name: '', phone: '', email: '', role: 'field_agent', commissionRate: '' })
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))
  const submit = async () => {
    const body = { name: f.name, phone: f.phone, role: f.role }
    if (f.email) body.email = f.email
    if (f.role === 'field_agent' && f.commissionRate) body.commissionRate = Number(f.commissionRate)
    sr(await api('POST', '/users', body, token))
  }
  return (
    <Card>
      <h2 style={c.h2}>➕ Create User</h2>
      <p style={c.desc}>Admin/Super Admin only. Super Admin can create admin accounts; admin can create field_agent, field_staff, tele_caller.</p>
      <div style={c.grid2}>
        <F label="Name" value={f.name} onChange={ch('name')} />
        <F label="Phone" value={f.phone} onChange={ch('phone')} placeholder="10-digit mobile" />
        <F label="Email (optional)" value={f.email} onChange={ch('email')} />
        <Sel label="Role" value={f.role} onChange={ch('role')} opts={[
          ['field_agent', 'Field Agent'],
          ['field_staff', 'Field Staff'],
          ['tele_caller', 'Tele Caller'],
          ['admin', 'Admin (super_admin only)'],
        ]} />
        {f.role === 'field_agent' && (
          <F label="Commission Rate %" value={f.commissionRate} onChange={ch('commissionRate')} type="number" placeholder="0 – 100" />
        )}
      </div>
      <button style={c.btn} onClick={submit}>Create User</button>
      <Res r={r} />
    </Card>
  )
}

function ListUsers({ token }) {
  const [f, sf] = useState({ role: '', isActive: '', page: '1', limit: '10' })
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))
  const submit = async () => {
    const q = new URLSearchParams({ page: f.page, limit: f.limit })
    if (f.role) q.append('role', f.role)
    if (f.isActive !== '') q.append('isActive', f.isActive)
    sr(await api('GET', `/users?${q}`, null, token))
  }
  return (
    <Card>
      <h2 style={c.h2}>📋 List Users</h2>
      <p style={c.desc}>Admin/Super Admin only. Filter by role and status.</p>
      <div style={c.grid2}>
        <Sel label="Role Filter" value={f.role} onChange={ch('role')} opts={[
          ['', 'All Roles'], ['super_admin', 'Super Admin'], ['admin', 'Admin'],
          ['field_agent', 'Field Agent'], ['field_staff', 'Field Staff'], ['tele_caller', 'Tele Caller'],
        ]} />
        <Sel label="Status Filter" value={f.isActive} onChange={ch('isActive')} opts={[['', 'All'], ['true', 'Active'], ['false', 'Inactive']]} />
        <F label="Page" value={f.page} onChange={ch('page')} type="number" />
        <F label="Limit" value={f.limit} onChange={ch('limit')} type="number" />
      </div>
      <button style={c.btn} onClick={submit}>List Users</button>
      <Res r={r} />
    </Card>
  )
}

function GetUser({ token }) {
  const [id, setId] = useState('')
  const [r, sr] = useState(null)
  return (
    <Card>
      <h2 style={c.h2}>🔍 Get User by ID</h2>
      <p style={c.desc}>Admin/Super Admin only. Paste a MongoDB ObjectId below.</p>
      <F label="User ID" value={id} onChange={e => setId(e.target.value)} placeholder="6507a1b2c3d4e5f6a7b8c9d0" />
      <button style={c.btn} onClick={async () => sr(await api('GET', `/users/${id}`, null, token))}>Get User</button>
      <Res r={r} />
    </Card>
  )
}

function EditUser({ token }) {
  const [id, setId] = useState('')
  const [f, sf] = useState({
    name: '', designation: '', gender: '', alternatePhone: '',
    city: '', state: '', pincode: '', street: '',
    locality: '', joiningDate: '', notes: '',
  })
  const [r, sr] = useState(null)
  const ch = k => e => sf(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!id) return alert('User ID is required')
    const body = {}
    if (f.name) body.name = f.name
    if (f.designation) body.designation = f.designation
    if (f.gender) body.gender = f.gender
    if (f.alternatePhone) body.alternatePhone = f.alternatePhone
    if (f.joiningDate) body.joiningDate = f.joiningDate
    if (f.notes) body.notes = f.notes
    if (f.locality) body.locality = f.locality.split(',').map(s => s.trim()).filter(Boolean)
    const addr = {}
    if (f.street) addr.street = f.street
    if (f.city) addr.city = f.city
    if (f.state) addr.state = f.state
    if (f.pincode) addr.pincode = f.pincode
    if (Object.keys(addr).length) body.address = addr
    sr(await api('PUT', `/users/${id}`, body, token))
  }

  return (
    <Card>
      <h2 style={c.h2}>✏️ Edit User (Admin)</h2>
      <p style={c.desc}>Admin/Super Admin only. Fill only fields you want to update. Super Admin can also set admin notes.</p>
      <F label="User ID *" value={id} onChange={e => setId(e.target.value)} placeholder="MongoDB ObjectId" />
      <hr style={c.hr} />
      <div style={c.grid2}>
        <F label="Name" value={f.name} onChange={ch('name')} />
        <F label="Designation" value={f.designation} onChange={ch('designation')} />
        <Sel label="Gender" value={f.gender} onChange={ch('gender')} opts={[['', '—'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} />
        <F label="Alternate Phone" value={f.alternatePhone} onChange={ch('alternatePhone')} />
        <F label="Joining Date" type="date" value={f.joiningDate} onChange={ch('joiningDate')} />
        <F label="Locality (comma-separated)" value={f.locality} onChange={ch('locality')} placeholder="Karol Bagh, Rajouri Garden" />
        <F label="Street" value={f.street} onChange={ch('street')} />
        <F label="City" value={f.city} onChange={ch('city')} />
        <F label="State" value={f.state} onChange={ch('state')} />
        <F label="Pincode" value={f.pincode} onChange={ch('pincode')} />
      </div>
      <F label="Admin Notes (super_admin only)" value={f.notes} onChange={ch('notes')} placeholder="Internal note about this user..." />
      <button style={c.btn} onClick={submit}>Update User</button>
      <Res r={r} />
    </Card>
  )
}

function ToggleStatus({ token }) {
  const [id, setId] = useState('')
  const [r, sr] = useState(null)
  return (
    <Card>
      <h2 style={c.h2}>🔄 Toggle User Status</h2>
      <p style={c.desc}>Admin/Super Admin only. Flips isActive — active → inactive or inactive → active.</p>
      <F label="User ID" value={id} onChange={e => setId(e.target.value)} placeholder="MongoDB ObjectId" />
      <button style={c.btn} onClick={async () => sr(await api('PUT', `/users/${id}/status`, {}, token))}>
        Toggle Status
      </button>
      <Res r={r} />
    </Card>
  )
}

function UpdateCommission({ token }) {
  const [id, setId] = useState('')
  const [rate, setRate] = useState('')
  const [r, sr] = useState(null)
  return (
    <Card>
      <h2 style={c.h2}>💰 Update Commission Rate</h2>
      <p style={c.desc}>Admin/Super Admin only. Only applies to field_agent accounts.</p>
      <F label="Field Agent User ID" value={id} onChange={e => setId(e.target.value)} placeholder="MongoDB ObjectId" />
      <F label="Commission Rate %" value={rate} onChange={e => setRate(e.target.value)} type="number" placeholder="0 – 100" />
      <button style={c.btn} onClick={async () => sr(await api('PUT', `/users/${id}/commission`, { commissionRate: Number(rate) }, token))}>
        Update Commission
      </button>
      <Res r={r} />
    </Card>
  )
}

// ── Sidebar menu config ───────────────────────────────────────────────────────
const MENU = [
  {
    group: 'Setup',
    items: [{ id: 'seed', icon: '🌱', label: 'Seed Super Admin' }],
  },
  {
    group: 'Field Agent',
    items: [{ id: 'register', icon: '📝', label: 'Self Register' }],
  },
  {
    group: 'Login (All Roles)',
    items: [
      { id: 'login', icon: '🔐', label: 'Login' },
    ],
  },
  {
    group: 'My Account',
    items: [
      { id: 'me', icon: '👤', label: 'My Profile' },
      { id: 'update-profile', icon: '✏️', label: 'Update Profile' },
      { id: 'upload-photo', icon: '🖼️', label: 'Upload Photo' },
    ],
  },
  {
    group: 'Admin Panel',
    items: [
      { id: 'create-user', icon: '➕', label: 'Create User' },
      { id: 'list-users', icon: '📋', label: 'List Users' },
      { id: 'get-user', icon: '🔍', label: 'Get User by ID' },
      { id: 'edit-user', icon: '✏️', label: 'Edit User' },
      { id: 'toggle-status', icon: '🔄', label: 'Toggle Status' },
      { id: 'commission', icon: '💰', label: 'Update Commission' },
    ],
  },
]

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [section, setSection] = useState('login')

  const SECTIONS = {
    'seed': <SeedAdmin token={token} setToken={setToken} />,
    'register': <Register setToken={setToken} goToLogin={() => setSection('login')} />,
    'login': <Login setToken={setToken} goToRegister={() => setSection('register')} />,
    'me': <MyProfile token={token} />,
    'update-profile': <UpdateProfile token={token} />,
    'upload-photo': <UploadPhoto token={token} />,
    'create-user': <CreateUser token={token} />,
    'list-users': <ListUsers token={token} />,
    'get-user': <GetUser token={token} />,
    'edit-user': <EditUser token={token} />,
    'toggle-status': <ToggleStatus token={token} />,
    'commission': <UpdateCommission token={token} />,
  }

  const handleToken = (val) => {
    setToken(val)
    localStorage.setItem('token', val)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* ── Top Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 50, background: '#0f172a', flexShrink: 0 }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: '#fff', letterSpacing: '-0.02em' }}>🏠 DPE Auth Tester</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#475569' }}>JWT TOKEN:</span>
        <input
          value={token}
          onChange={e => handleToken(e.target.value)}
          placeholder="Paste token here or login via Verify OTP →"
          style={{ width: 380, padding: '5px 10px', borderRadius: 5, border: '1px solid #1e293b', background: '#1e293b', color: '#94a3b8', fontSize: 11, outline: 'none' }}
        />
        {token && (
          <button onClick={() => { handleToken(''); localStorage.removeItem('token') }}
            style={{ padding: '4px 10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11 }}>
            Clear
          </button>
        )}
        {token && (
          <span style={{ ...c.tag, background: '#16a34a', color: '#fff' }}>Logged In</span>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 210, background: '#1e293b', overflowY: 'auto', flexShrink: 0 }}>
          {MENU.map(g => (
            <div key={g.group}>
              <div style={{ padding: '12px 14px 4px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {g.group}
              </div>
              {g.items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    padding: '9px 16px',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: section === item.id ? '#fff' : '#94a3b8',
                    background: section === item.id ? '#2563eb' : 'transparent',
                    borderLeft: section === item.id ? '3px solid #60a5fa' : '3px solid transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.1s',
                  }}
                >
                  <span>{item.icon}</span>
                  <span style={{ fontWeight: section === item.id ? 600 : 400 }}>{item.label}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ height: 20 }} />
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <div style={{ maxWidth: 700 }}>
            {SECTIONS[section]}
          </div>
        </div>
      </div>
    </div>
  )
}
