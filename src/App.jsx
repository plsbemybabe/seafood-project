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

  // Data State
  const [allOrders, setAllOrders] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [coupons, setCoupons] = useState([])
  
  // Input State
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
    if ((view === 'management' || view === 'admin' || view === 'cart')) { 
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

  // --- Admin/Owner Tools ---
  const addProduct = async () => {
    const name = prompt("ชื่อสินค้า:");
    const price = parseInt(prompt("ราคา:"));
    const stock = parseInt(prompt("จำนวนสต็อกเริ่มต้น:"));
    const img = prompt("ลิงก์รูปภาพ:");
    if (name && price && img) {
      await supabase.from('products').insert([{ name, price, stock: stock || 0, image_url: img }]);
      fetchProducts();
      showNotify("เพิ่มสินค้าสำเร็จ");
    }
  }

  const updateStock = async (id, newStock) => {
    if (newStock < 0) return;
    await supabase.from('products').update({ stock: newStock }).eq('id', id);
    fetchProducts();
  }

  const deleteProduct = async (id) => {
    if(confirm("ลบสินค้านี้?")) {
      await supabase.from('products').delete().eq('id', id);
      fetchProducts();
      showNotify("ลบสำเร็จ", "error");
    }
  }

  const totalRevenue = allOrders.filter(o => o.status === 'สำเร็จ').reduce((sum, o) => sum + (o.total_price || 0), 0);

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
    } catch (err) { showNotify("ผิดพลาด: เช็คว่าสร้าง Bucket ชื่อ slips หรือยัง", "error"); }
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return showNotify(error.message, "error");
      if (data.user) await supabase.from('profiles').insert([{ id: data.user.id, email: email, role: 'customer' }]);
      showNotify("สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้เลย");
      setIsSignUp(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showNotify("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "error");
      else { showNotify("ยินดีต้อนรับ!"); setView('shop'); }
    }
  }

  if (loading) return <div style={fullCenter}>🚢 LOADING...</div>

  const isOwner = profile?.role === 'owner' || user?.email === 'myname789987@gmail.com';

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
          <button onClick={() => setView('cart')} style={view === 'cart' ? btnMenuAc : btnMenu}>🛒 ({cart.length})</button>
          <button onClick={() => setView('profile')} style={view === 'profile' ? btnMenuAc : btnMenu}>📜 ประวัติ</button>
          {isOwner && <button onClick={() => setView('management')} style={view === 'management' ? btnMenuAc : btnOwner}>📊 การจัดการ</button>}
        </div>
      </header>

      {/* --- View: Login (แก้ไขปุ่มลืมรหัสผ่าน) --- */}
      {view === 'login' && !user && (
        <div style={fullCenter}>
          <div style={loginBoxS}>
            <h2 style={{color: '#0066cc', marginBottom: '20px'}}>{isSignUp ? 'สมัครสมาชิก' : 'Login'}</h2>
            <form onSubmit={handleAuth}>
              <input type="email" placeholder="Email" style={inputS} value={email} onChange={e=>setEmail(e.target.value)} required />
              <input type="password" placeholder="Password (6 ตัวขึ้นไป)" style={inputS} value={password} onChange={e=>setPassword(e.target.value)} required />
              <button type="submit" style={btnBlueLarge}>{isSignUp ? 'ยืนยัน' : 'Login'}</button>
              
              <p onClick={() => setIsSignUp(!isSignUp)} style={{fontSize:'12px', cursor:'pointer', marginTop:'15px', color:'#666'}}>
                {isSignUp ? 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ' : 'สมัครสมาชิกที่นี่'}
              </p>

              {/* ปุ่มลืมรหัสผ่านที่จะโชว์ตลอดที่หน้า Login */}
              {!isSignUp && (
                <p onClick={async () => {
                  if(!email) return showNotify("กรุณากรอกอีเมลก่อน","error");
                  const { error } = await supabase.auth.resetPasswordForEmail(email);
                  if (error) showNotify(error.message, "error");
                  else showNotify("ส่งลิงก์ไปที่เมลแล้ว");
                }} style={forgotText}>ลืมรหัสผ่าน?</p>
              )}
              
              <button type="button" onClick={() => setView('shop')} style={btnText}>กลับหน้าร้าน</button>
            </form>
          </div>
        </div>
      )}

      {/* --- View: Management (จัดการสต็อก) --- */}
      {view === 'management' && isOwner && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={revenueBox}><h4>💰 ยอดขายรวม: {totalRevenue.toLocaleString()} ฿</h4></div>
          <div style={boxS}>
            <h4>📦 จัดการสินค้า</h4>
            <button onClick={addProduct} style={btnBlueSmall}>+ เพิ่มสินค้า</button>
            {products.map(p => (
              <div key={p.id} style={itemRow}>
                <span>{p.name} ({p.stock || 0})</span>
                <div>
                  <button onClick={() => updateStock(p.id, (p.stock || 0) - 1)} style={btnCount}>-</button>
                  <button onClick={() => updateStock(p.id, (p.stock || 0) + 1)} style={btnCount}>+</button>
                  <button onClick={() => deleteProduct(p.id)} style={{color:'red', border:'none', marginLeft:'10px', background:'none'}}>ลบ</button>
                </div>
              </div>
            ))}
          </div>
          <h3 style={sectionTitle}>📋 ออเดอร์</h3>
          {allOrders.map(o => (
            <div key={o.id} style={boxS}>
              <div style={{display:'flex', justifyContent:'space-between'}}><b>#{o.id.slice(0,5)}</b> <b>{o.total_price} ฿</b></div>
              {o.slip_url && <a href={o.slip_url} target="_blank" rel="noreferrer" style={slipLink}>ดูสลิป</a>}
              {o.status !== 'สำเร็จ' && <button onClick={()=>confirmOrder(o.id)} style={btnGreenSmall}>ยืนยันชำระเงิน</button>}
            </div>
          ))}
        </div>
      )}

      {/* --- View: Shop --- */}
      {view === 'shop' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {products.map(p => (
            <div key={p.id} style={cardS}>
              <img src={p.image_url} style={imgS} alt={p.name} />
              <h4>{p.name}</h4><p>{p.price} ฿</p>
              <button 
                onClick={() => {setCart([...cart, p]); setTotalPrice(totalPrice+p.price); showNotify("เพิ่มแล้ว")}} 
                style={{...btnBlue, background: p.stock > 0 ? '#0066cc' : '#ccc'}}
                disabled={p.stock <= 0}
              >
                {p.stock > 0 ? '+ หยิบ' : 'สินค้าหมด'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* --- View: Cart --- */}
      {view === 'cart' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={sectionTitle}>🛒 ตะกร้า</h3>
          <div style={boxS}>
            {cart.map((item, idx) => <div key={idx} style={itemRow}><span>{item.name}</span><b>{item.price} ฿</b></div>)}
            <h3 style={{textAlign:'right'}}>สุทธิ: {totalPrice - (appliedCoupon?.discount_amount || 0)} ฿</h3>
            <p style={{fontSize:'12px'}}>📸 แนบสลิป:</p>
            <input type="file" onChange={e=>setSlipFile(e.target.files[0])} />
            <button onClick={handleCheckout} style={{...btnBlue, marginTop:'15px'}}>ยืนยันสั่งซื้อ</button>
          </div>
        </div>
      )}

      {/* --- View: Profile --- */}
      {view === 'profile' && (
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={sectionTitle}>📜 ประวัติ</h3>
          {myOrders.map(o => (
            <div key={o.id} style={boxS}>
              <span>#{o.id.slice(0,8)}</span> - <b style={{color: o.status === 'สำเร็จ' ? 'green' : 'orange'}}>{o.status}</b>
            </div>
          ))}
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
const revenueBox = { background: 'white', padding: '20px', borderRadius: '25px', marginBottom: '20px', textAlign: 'center' };
const sectionTitle = { borderLeft: '6px solid #0066cc', paddingLeft: '12px', fontWeight: 'bold', fontSize:'20px', marginBottom:'15px' };
const inputS = { width:'100%', padding: '12px', borderRadius: '12px', border: '1px solid #ddd', boxSizing:'border-box', marginBottom: '10px' };
const btnBlueLarge = { width: '100%', padding: '12px', borderRadius: '12px', background: '#0066cc', color: 'white', border:'none', cursor:'pointer' };
const forgotText = { fontSize: '12px', color: '#0066cc', cursor: 'pointer', marginTop: '15px', textDecoration: 'underline' };
const slipLink = { fontSize:'12px', color:'#0066cc', textDecoration:'underline', display:'block', marginBottom:'10px' };
const btnGreenSmall = { background: '#28a745', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '10px', cursor: 'pointer' };
const btnBlue = { width: '100%', padding: '12px', borderRadius: '12px', background: '#0066cc', color: 'white', border:'none', fontWeight:'bold', cursor:'pointer' };
const btnBlueSmall = { padding: '8px 15px', borderRadius: '10px', background: '#0066cc', color: 'white', border:'none', cursor:'pointer' };
const btnLogoutS = { color: '#e63946', border: '1px solid #e63946', background: 'none', padding: '8px 15px', borderRadius: '12px', cursor:'pointer' };
const loginBoxS = { background: 'white', padding: '40px', borderRadius: '30px', width: '320px', textAlign: 'center' };
const btnText = { background: 'none', border: 'none', color: '#666', marginTop: '15px', cursor: 'pointer' };
const fullCenter = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', flexDirection:'column' };
const itemRow = { display: 'flex', justifyContent: 'space-between', padding: '10px 0', alignItems:'center' };
const cardS = { background: 'white', padding: '15px', borderRadius: '25px', textAlign: 'center' };
const imgS = { width: '100%', height: '100px', objectFit: 'cover', borderRadius: '15px' };
const btnCount = { width:'30px', height:'30px', borderRadius:'50%', border:'1px solid #ddd', background:'white', cursor:'pointer', fontWeight:'bold' };

export default App;
