import math, sys

def squircle(cx, cy, size, n=3.0, pts=90):
    e = 0.30*size; h = size/2
    corners = [(cx+h-e, cy-h+e, 0), (cx+h-e, cy+h-e, 90), (cx-h+e, cy+h-e, 180), (cx-h+e, cy-h+e, 270)]
    out=[]
    for (ox, oy, start) in corners:
        for i in range(pts+1):
            t = math.radians(start - 90 + 90*i/pts)
            c, s_ = math.cos(t), math.sin(t)
            out.append(f"{ox+e*math.copysign(abs(c)**(2/n),c):.2f},{oy+e*math.copysign(abs(s_)**(2/n),s_):.2f}")
    return "M"+" L".join(out)+" Z"
RRECT = "M230,0 H794 A230,230 0 0 1 1024,230 V794 A230,230 0 0 1 794,1024 H230 A230,230 0 0 1 0,794 V230 A230,230 0 0 1 230,0 Z"

def rtri(pts, r):
    out=[]
    n=len(pts)
    for i in range(n):
        p0, p1, p2 = pts[i-1], pts[i], pts[(i+1)%n]
        def toward(a, b, d):
            L=math.hypot(b[0]-a[0], b[1]-a[1]); return (a[0]+(b[0]-a[0])*d/L, a[1]+(b[1]-a[1])*d/L)
        a = toward(p1, p0, r); b = toward(p1, p2, r)
        out.append((a, p1, b))
    d=f"M{out[0][2][0]:.1f},{out[0][2][1]:.1f} "
    for i in range(1, n+1):
        a, p, b = out[i % n]
        d+=f"L{a[0]:.1f},{a[1]:.1f} Q{p[0]:.1f},{p[1]:.1f} {b[0]:.1f},{b[1]:.1f} "
    return d+"Z"

def svg(mode="mac", detail="full", P="", compact=False):
    T = 824 if mode=="mac" else 1024
    k = 1.0 if mode=="mac" else 1.08
    if mode!="mac" and detail=="simple": k = 1.0
    simple = detail=="simple"
    tile = RRECT if compact else squircle(512,512,T)
    f = (10.6 if not simple else 11.4)*k
    ox = 512 - 32*f - 6*k; oy = 512 - 32*f
    M = lambda x,y: (ox+x*f, oy+y*f)
    outer = rtri([M(27,12.5), M(58.5,32), M(27,51.5)], 3.6*f)
    hole_s = 1.0 if not simple else 1.15
    cxh, cyh = 38.6, 32
    inner = rtri([M(cxh-4.6*hole_s, cyh-7.4*hole_s), M(cxh+7.4*hole_s, cyh), M(cxh-4.6*hole_s, cyh+7.4*hole_s)], 1.6*f)
    tri = outer + " " + inner
    dep = 13*k
    bars = [(6,21,6.4,22, 0.55), (15.5,16,6.4,32, 0.85)]
    g=[f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
 <linearGradient id="{P}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#24212B"/><stop offset="1" stop-color="#0B0A0E"/></linearGradient>
 <radialGradient id="{P}bloom" cx="0.56" cy="0.5" r="0.5"><stop offset="0" stop-color="#FF4F7A" stop-opacity="0.26"/><stop offset="0.25" stop-color="#C255D9" stop-opacity="0.15"/><stop offset="0.5" stop-color="#9A5CFF" stop-opacity="0.07"/><stop offset="0.75" stop-color="#9A5CFF" stop-opacity="0.02"/><stop offset="1" stop-color="#9A5CFF" stop-opacity="0"/></radialGradient>
 <linearGradient id="{P}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.04"/><stop offset="1" stop-color="#fff" stop-opacity="0.08"/></linearGradient>
 <linearGradient id="{P}paint" gradientUnits="userSpaceOnUse" x1="{M(4,50)[0]:.0f}" y1="{M(4,50)[1]:.0f}" x2="{M(58,14)[0]:.0f}" y2="{M(58,14)[1]:.0f}"><stop offset="0" stop-color="#3A7BFF"/><stop offset="0.32" stop-color="#9A5CFF"/><stop offset="0.64" stop-color="#FF4F7A"/><stop offset="1" stop-color="#FFAE2B"/></linearGradient>
 <linearGradient id="{P}side" gradientUnits="userSpaceOnUse" x1="{M(4,50)[0]:.0f}" y1="{M(4,50)[1]:.0f}" x2="{M(58,14)[0]:.0f}" y2="{M(58,14)[1]:.0f}"><stop offset="0" stop-color="#1F3F8A"/><stop offset="0.32" stop-color="#4E2D8C"/><stop offset="0.64" stop-color="#8A2443"/><stop offset="1" stop-color="#8A5A14"/></linearGradient>
 <linearGradient id="{P}sheen" gradientUnits="userSpaceOnUse" x1="0" y1="{M(0,12)[1]:.0f}" x2="0" y2="{M(0,52)[1]:.0f}"><stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="0.48" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.10"/></linearGradient>
 <filter id="{P}tileshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.5"/></filter>
 <filter id="{P}markshadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="{16*k:.1f}" stdDeviation="{20*k:.1f}" flood-color="#000" flood-opacity="0.55"/></filter>
 <clipPath id="{P}tclip"><path d="{tile}"/></clipPath>
</defs>''']
    if mode=="mac" and not compact: g.append(f'<path d="{tile}" fill="#000" filter="url(#{P}tileshadow)"/>')
    g.append(f'<path d="{tile}" fill="url(#{P}bg)"/>')
    g.append(f'<g clip-path="url(#{P}tclip)"><rect width="1024" height="1024" fill="url(#{P}bloom)"/></g>')
    sh = '' if compact else f' filter="url(#{P}markshadow)"'
    for (x,y,w,h,op) in bars:
        (X,Y) = M(x,y); W=w*f; H=h*f; r=W/2
        g.append(f'<g opacity="{op}"><rect x="{X:.1f}" y="{Y+dep:.1f}" width="{W:.1f}" height="{H:.1f}" rx="{r:.1f}" fill="url(#{P}side)"{sh}/>'
                 f'<rect x="{X:.1f}" y="{Y:.1f}" width="{W:.1f}" height="{H:.1f}" rx="{r:.1f}" fill="url(#{P}paint)"/>'
                 f'<rect x="{X:.1f}" y="{Y:.1f}" width="{W:.1f}" height="{H:.1f}" rx="{r:.1f}" fill="url(#{P}sheen)"/>'
                 f'<rect x="{X+1.5*k:.1f}" y="{Y+1.5*k:.1f}" width="{W-3*k:.1f}" height="{H-3*k:.1f}" rx="{r-1.5*k:.1f}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="{2.5*k:.1f}"/></g>')
    g.append(f'<path d="{tri}" fill-rule="evenodd" fill="url(#{P}side)" transform="translate(0 {dep:.1f})"{sh}/>')
    g.append(f'<path d="{tri}" fill-rule="evenodd" fill="url(#{P}paint)"/>')
    g.append(f'<path d="{tri}" fill-rule="evenodd" fill="url(#{P}sheen)"/>')
    g.append(f'<path d="{outer}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="{3*k:.1f}"/>')
    g.append(f'<path d="{inner}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="{3*k:.1f}"/>')
    g.append(f'<path d="{tile}" fill="none" stroke="url(#{P}rim)" stroke-width="{3*(T/824):.1f}" clip-path="url(#{P}tclip)"/>')
    g.append('</svg>')
    return "\n".join(g)

if __name__=="__main__":
    open(sys.argv[3],"w").write(svg(sys.argv[1], sys.argv[2]))
