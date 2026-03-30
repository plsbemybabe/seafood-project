import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

const supabaseUrl = 'https://yyxetpmqtdtzhcwamlta.supabase.co'
const supabaseKey = 'sb_publishable_8sqvE7vIFihb5bdZZaN-8w_mQnHZRqo'
const supabase = createClient(supabaseUrl, supabaseKey)

function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('shop')
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [notify, setNotify] = useState({ msg: '', type: '' }) 
  const [loading, setLoading] = useState(true)

  const [allOrders, setAllOrders] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [coupons, setCoupons] = useState([])
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [slipFile, setSlipFile] = useState(null)
  const [appliedCoupon, setAppliedCoupon] = useState(null)

  const showNotify = (msg, type = 'success') => {
    setNotify({ msg, type });
    setTimeout(() => setNotify({ msg: '', type: '' }), 3000);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUser(session.user);
        const { data: pf } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setProfile(pf);
      }
      fetchProducts();
      fetchCoupons();
      setLoading(false);
    }
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUser(session.user);
        const { data: pf } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setProfile(pf);
      } else {
        setUser(null); setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [])

  useEffect(() => {
    if (view === 'admin' || view === 'cart') { 
        fetchCoupons(); 
        fetchAllOrders();
    }
    if (view === 'profile' && user) fetchMyOrders(user.id);
  }, [view, user])

  // --- API Functions ---
  async function fetchProducts() { const { data } = await supabase.from('products').select('*').order('name'); setProducts(data || []); }
  async function fetchCoupons() { const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }); setCoupons(data || []); }
  async function fetchAllOrders() { const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false }); setAllOrders(data || []); }
  async function fetchMyOrders(uid) { const { data } = await supabase.from('orders').select('*').eq('user_id', uid).order('created_at', { ascending: false }); setMyOrders(data || []); }

  // --- Admin Logic ---
  const addProduct = async () => {
    const name = prompt("ชื่อสินค้า:");
    const price = parseInt(prompt("ราคา:"));
    const img = prompt("ลิงก์รูปภาพ:");
    if (name && price && img) {
      await supabase.from('products').insert([{ name, price: price, image_url: img }]);
      fetchProducts();
      showNotify("เพิ่มสินค้าสำเร็จ");
    }
  }

  const deleteProduct = async (id) => {
    if(confirm("ลบสินค้านี้?")) {
      await supabase.from('products').delete().eq('id', id);
      fetchProducts();
      showNotify("ลบสำเร็จ", "error");
    }
  }

  const addCoupon = async () => {
    const code = prompt("รหัสคูปอง:");
    const disc = parseInt(prompt("ส่วนลด (บาท):"));
    if (code && disc) {
      await supabase.from('coupons').insert([{ code, discount_amount: disc }]);
      fetchCoupons();
      showNotify("เพิ่มคูปองสำเร็จ");
    }
  }

  const confirmOrder = async (orderId) => {
    await supabase.from('orders').update({ status: 'สำเร็จ' }).eq('id', orderId);
    fetchAllOrders();
    showNotify("ยืนยันออเดอร์สำเร็จ 🎉");
  }

  const handleCheckout = async () => {
    if (!user) return showNotify("กรุณา Login ก่อน", "error");
    if (cart.length === 0) return showNotify("ตะกร้าว่าง", "error");
    if (!slipFile) return showNotify("แนบสลิปด้วยครับ", "error");
    const finalPrice = totalPrice - (appliedCoupon?.discount_amount || 0);
    try {
      const fileName = `${Date.now()}_slip`;
      await supabase.storage.from('slips').upload(fileName, slipFile);
      const { data: { publicUrl } } = supabase.storage.from('slips').getPublicUrl(fileName);
      await supabase.from('orders').insert([{ user_id: user.id, total_price: finalPrice > 0 ? finalPrice : 0, slip_url: publicUrl, status: 'รอการตรวจสอบ' }]);
      setCart([]); setTotalPrice(0); setSlipFile(null); setAppliedCoupon(null); setView('profile');
      showNotify("สั่งซื้อสำเร็จ!");
    } catch (err) { showNotify("ผิดพลาด", "error"); }
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return showNotify(error.message, "error");
      if (data.user) await supabase.from('profiles').insert([{ id: data.user.id, email: email, role: 'customer' }]);
      showNotify("สมัครสำเร็จ! เข้าสู่ระบบได้เลย");
      setIsSignUp(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showNotify("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error");
      else { showNotify("ยินดีต้อนรับ!"); setView('shop'); }
    }
  }

  if (loading) return <div style={fullCenter}>🚢 LOADING...</div>

  // --- เช็คสิทธิ์ Admin/Owner ---
  const isOwner = user?.email === 'myname789987@gmail.com' || profile?.role === 'owner';
  const isAdmin = profile?.role === 'admin' || isOwner;

  return (
    <div style={{ padding: '15px', backgroundColor: '#f4f7f6', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      {notify.msg && <div style={toast(notify.type)}>{notify.msg}</div>}

      <header style={headerS}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h2 onClick={() => setView('shop')} style={{cursor:'pointer', color:'#0066cc', margin:0}}>🚢 SEAFOOD {profile?.name || ''}</h2>
          {user ? <button onClick={() => supabase.auth.signOut()} style={btnLogoutS}>Logout</button> : <button onClick={() => setView('login')} style={btnBlueSmall}>Login</button>}
        </div>
        <div style={{display:'flex', gap:'10px', marginTop:'15px', overflowX:'auto'}}>
          <button onClick={() => setView('shop')} style={view === 'shop' ? btnMenuAc : btnMenu}>หน้าร้าน</button>
          <button onClick={() => setView('cart')} style={view === 'cart' ? btnMenuAc : btnMenu}>🛒 ตะกร้า ({cart.length})</button>
          <button onClick={() => setView('profile')} style={view === 'profile' ? btnMenuAc : btnMenu}>📜 ประวัติ</button>
          {(isOwner || isAdmin) && <button onClick={() => setView('admin')} style={view === 'admin' ? btnMenuAc : btnOwner}>⚙️ จัดการร้าน</button>}
        </div>
      </header>

      {/* --- View: Admin/Owner --- */}
      {view === 'admin' && (isOwner || isAdmin) && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h3 style={sectionTitle}>⚙️ ระบบจัดการร้านค้า</h3>
          <div style={boxS}>
            <h4>📦 สินค้า</h4>
            <button onClick={addProduct} style={btnBlueSmall}>+ เพิ่มสินค้า</button>
            <div style={{marginTop:'10px'}}>
              {products.map(p => (
                <div key={p.id} style={itemRow}>
                  <span>{p.name} ({p.price}฿)</span>
                  <button onClick={() => deleteProduct(p.id)} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>ลบ</button>
                </div>
              ))}
            </div>
          </div>
          <div style={boxS}>
            <h4>🎟️ คูปอง</h4>
            <button onClick={addCoupon} style={btnBlueSmall}>+ เพิ่มคูปอง</button>
            <div style={{marginTop:'10px'}}>
              {coupons.map(c => (
                <div key={c.id} style={itemRow}><span>{c.code} (-{c.discount_amount}฿)</span></div>
              ))}
            </div>
          </div>
          <div style={boxS}>
            <h4>📋 ออเดอร์ทั้งหมด</h4>
            {allOrders.map(o => (
              <div key={o.id} style={{borderBottom:'1px solid #eee', padding:'10px 0'}}>
                <div style={{display:'flex', justifyContent:'space-between'}}><b>#{o.id.slice(0,5)}</b> <b>{o.total_price} ฿</b></div>
                <p style={{fontSize:'12px', color: o.status === 'สำเร็จ' ? 'green' : 'orange'}}>สถานะ: {o.status}</p>
                {o.slip_url && <a href={o.slip_url} target="_blank" rel="noreferrer" style={slipLink}>ดูสลิป</a>}
                {isOwner && o.status !== 'สำเร็จ' && <button onClick={()=>confirmOrder(o.id)} style={btnGreenSmall}>ยืนยันชำระเงิน</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- View: Shop --- */}
      {view === 'shop' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {products.map(p => (
            <div key={p.id} style={cardS}>
              <img src={p.image_url} style={imgS} alt={p.name} />
              <h4>{p.name}</h4><p style={{color:'#e63946', fontWeight:'bold'}}>{p.price} ฿</p>
              <button onClick={() => {setCart([...cart, p]); setTotalPrice(totalPrice+p.price); showNotify("หยิบใส่ตะกร้า")}} style={btnBlue}>+ หยิบ</button>
            </div>
          ))}
        </div>
      )}

      {/* --- View: Login/Sign Up --- */}
      {view === 'login' && !user && (
        <div style={fullCenter}>
          <div style={loginBoxS}>
            <h2 style={{color: '#0066cc'}}>{isSignUp ? 'สมัครสมาชิก' : 'Login'}</h2>
            <form onSubmit={handleAuth}>
              <input type="email" placeholder="Email" style={inputS} value={email} onChange={e=>setEmail(e.target.value)} required />
              <input type="password" placeholder="Password (6 ตัวขึ้นไป)" style={inputS} value={password} onChange={e=>setPassword(e.target.value)} required />
              <button type="submit" style={btnBlueLarge}>{isSignUp ? 'ยืนยันการสมัคร' : 'Login'}</button>
              <p onClick={() => setIsSignUp(!isSignUp)} style={{fontSize:'12px', cursor:'pointer', marginTop:'10px'}}>
                {isSignUp ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ไม่มีบัญชี? สมัครที่นี่'}
              </p>
              <button type="button" onClick={() => setView('shop')} style={btnText}>กลับหน้าร้าน</button>
            </form>
          </div>
        </div>
      )}

      {/* --- View: Cart --- */}
      {view === 'cart' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={sectionTitle}>🛒 ตะกร้าสินค้า</h3>
          <div style={boxS}>
            {cart.map((item, idx) => <div key={idx} style={itemRow}><span>{item.name}</span><b>{item.price} ฿</b></div>)}
            {cart.length > 0 ? (
              <div style={{marginTop:'20px', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                <p>🎟️ เลือกส่วนลด:</p>
                <div style={{display:'flex', gap:'8px', marginBottom:'15px', overflowX:'auto'}}>
                  {coupons.map(c => (
                    <button key={c.id} onClick={() => { setAppliedCoupon(c); showNotify(`ใช้คูปอง ${c.code}`); }}
                      style={{ padding:'8px', borderRadius:'10px', fontSize:'12px', background: appliedCoupon?.id === c.id ? '#e1f0ff' : 'white' }}>
                      {c.code} (-{c.discount_amount}฿)
                    </button>
                  ))}
                </div>
                <h3 style={{color:'#e63946', textAlign:'right'}}>สุทธิ: {Math.max(0, totalPrice - (appliedCoupon?.discount_amount || 0))} ฿</h3>
                <input type="file" onChange={e=>setSlipFile(e.target.files[0])} style={{marginTop:'10px'}} />
                <button onClick={handleCheckout} style={{...btnBlue, background: user ? '#28a745' : '#ccc', marginTop:'15px'}}>ยืนยันสั่งซื้อ</button>
              </div>
            ) : <p>ไม่มีสินค้าในตะกร้า</p>}
          </div>
        </div>
      )}

      {/* --- View: Profile --- */}
      {view === 'profile' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={sectionTitle}>📜 ประวัติสั่งซื้อ</h3>
          {myOrders.length > 0 ? myOrders.map(o => (
            <div key={o.id} style={boxS}>
              <div style={{display:'flex', justifyContent:'space-between'}}><span>#{o.id.slice(0,8)}</span><b>{o.total_price} ฿</b></div>
              <p style={{color: o.status === 'สำเร็จ' ? 'green' : 'orange'}}>สถานะ: {o.status}</p>
            </div>
          )) : <p>ยังไม่มีประวัติการสั่งซื้อ</p>}
        </div>
      )}
    </div>
  )
}

// --- Styles ---
const toast = (type) => ({ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', padding: '12px 25px', borderRadius: '25px', color: 'white', backgroundColor: type === 'error' ? '#e63946' : '#28a745', zIndex: 1000 });
const headerS = { background: 'white', padding: '20px', borderRadius: '25px', marginBottom: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' };
const btnMenu = { background: '#f0f2f5', border: 'none', padding: '10px 15px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' };
const btnMenuAc = { ...btnMenu, background: '#e1f0ff', color: '#0066cc' };
const btnOwner = { ...btnMenu, background: '#fff9e6', color: '#d4af37' };
const boxS = { background: 'white', padding: '20px', borderRadius: '25px', marginBottom:'10px' };
const sectionTitle = { borderLeft: '6px solid #0066cc', paddingLeft: '12px', fontWeight: 'bold', fontSize:'20px', marginBottom:'15px' };
const inputS = { width:'100%', padding: '12px', borderRadius: '12px', border: '1px solid #ddd', boxSizing:'border-box', marginBottom: '10px' };
const btnBlueLarge = { width: '100%', padding: '12px', borderRadius: '12px', background: '#0066cc', color: 'white', border:'none', cursor:'pointer' };
const slipLink = { fontSize:'12px', color:'#0066cc', textDecoration:'underline', display:'block', marginBottom:'10px' };
const btnGreenSmall = { background: '#28a745', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '10px', cursor: 'pointer', marginTop:'5px' };
const btnBlue = { width: '100%', padding: '12px', borderRadius: '12px', background: '#0066cc', color: 'white', border:'none', fontWeight:'bold', cursor:'pointer' };
const btnBlueSmall = { padding: '8px 15px', borderRadius: '10px', background: '#0066cc', color: 'white', border:'none', cursor:'pointer' };
const btnLogoutS = { color: '#e63946', border: '1px solid #e63946', background: 'none', padding: '8px 15px', borderRadius: '12px', cursor:'pointer' };
const loginBoxS = { background: 'white', padding: '40px', borderRadius: '30px', width: '320px', textAlign: 'center' };
const btnText = { background: 'none', border: 'none', color: '#666', marginTop: '15px', cursor: 'pointer' };
const fullCenter = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection:'column' };
const itemRow = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom:'1px solid #eee' };
const cardS = { background: 'white', padding: '15px', borderRadius: '25px', textAlign: 'center' };
const imgS = { width: '100%', height: '100px', objectFit: 'cover', borderRadius: '15px' };

export default App;
