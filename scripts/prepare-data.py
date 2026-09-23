import json,xml.etree.ElementTree as E,urllib.request,concurrent.futures,os
os.makedirs('public/cards',exist_ok=True)
allcards=json.load(urllib.request.urlopen('https://ringsdb.com/api/public/cards/',timeout=30)); core=json.load(urllib.request.urlopen('https://ringsdb.com/api/public/cards/core.json',timeout=30))
def normalize(c):
 return {k:c[k] for k in ['code','name','type_code','sphere_code','cost','threat','willpower','attack','defense','health','traits','text','is_unique','pack_name','pack_code','illustrator','imagesrc','url','quantity'] if k in c}
json.dump([normalize(c) for c in allcards],open('public/catalog.json','w'),ensure_ascii=False)
json.dump([normalize(c) for c in core],open('src/data/player-cards.json','w'),ensure_ascii=False,indent=2)
enc=[]
for c in E.fromstring(urllib.request.urlopen('https://raw.githubusercontent.com/GeckoTH/Lord-of-the-Rings/master/o8g/Sets/Core%20Set/set.xml',timeout=30).read()).findall('.//card'):
 p={v.get('name'):v.get('value') for v in c.findall('property')}
 if p.get('Encounter Set') not in ['Passage Through Mirkwood','Spiders of Mirkwood','Dol Guldur Orcs'] or p.get('Type')=='Quest':continue
 n=int(p['Card Number']); name=c.get('name').replace('Chieftan','Chieftain')
 d={'code':'01'+str(n).zfill(3),'name':name,'type_code':p['Type'].lower(),'sphere_code':'encounter','pack_name':'Core Set','traits':p.get('Traits',''),'text':p.get('Text','').replace('Û','[attack]').replace('Ò','[willpower]').replace('$','[threat]'),'shadow':p.get('Shadow','').replace('Û','[attack]'),'quantity':int(p['Quantity']),'encounter_set':p['Encounter Set'],'imagesrc':'https://hallofbeorn.com/Images/Cards/Core-Set/'+name.replace(' ','-')+'.jpg'}
 for a,b in [('Threat','threat'),('Attack','attack'),('Defense','defense'),('Health','health'),('Engagement Cost','engagement'),('Quest Points','quest'),('Victory Points','victory')]:
  if a in p:d[b]=int(p[a])
 if n==89:d['imagesrc']='https://www.hallofbeorn.com/Images/Cards/Core-Set/Dol-Guldur-Orcs-Enemy.jpg'
 if n==90:d['imagesrc']='https://www.hallofbeorn.com/Images/Cards/Core-Set/Chieftan-Ufthak.jpg'
 enc.append(d)
json.dump(enc,open('src/data/encounter-cards.json','w'),ensure_ascii=False,indent=2)
def dl(c):
 code=c['code'];u=c['imagesrc'];u=u if u.startswith('http') else 'https://ringsdb.com'+u
 ext='jpg' if u.endswith('jpg') else 'png';path='public/cards/'+code+'.'+ext
 if os.path.exists(path):return None
 try:
  r=urllib.request.urlopen(u,timeout=25);b=r.read();open(path,'wb').write(b)
 except Exception as e:return code,str(e)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as p:
 errors=[r for r in p.map(dl,core+enc) if r]
print(json.dumps({'catalog':len(allcards),'core':len(core),'encounterDefinitions':len(enc),'encounterDeck':sum(c['quantity'] for c in enc),'imageErrors':errors}))
