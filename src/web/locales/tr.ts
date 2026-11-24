import type { Catalog } from '../i18n';

/** Turkish for promptshare.cc. Keys are the English sentences exactly as the pages write them. */
export const tr: Catalog = {
  months: [
    'Ocak',
    'Şubat',
    'Mart',
    'Nisan',
    'Mayıs',
    'Haziran',
    'Temmuz',
    'Ağustos',
    'Eylül',
    'Ekim',
    'Kasım',
    'Aralık',
  ],
  monthsShort: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  messages: {
    '2earl account': '2earl hesabı',
    '3–30 lowercase letters, digits or hyphens': '3–30 küçük harf, rakam veya tire',
    '<0>Brief</0> You': '<0>Özet</0> Siz',
    '<0>New tools don’t appear.</0> Disconnect and connect again; assistants keep the list of tools from when you connected.':
      '<0>Yeni araçlar görünmüyor.</0> Bağlantıyı kesip yeniden bağlanın; asistanlar araç listesini bağlandığınız andaki haliyle tutar.',
    '<0>Public</0> Every 2earl user can see this prompt.':
      '<0>Herkese açık</0> Her 2earl kullanıcısı bu prompt’u görebilir.',
    '<0>Sign-in asks again and again.</0> Allow cookies for login.2earl.com, or sign out of other Google accounts in that browser and try again.':
      '<0>Giriş tekrar tekrar soruluyor.</0> login.2earl.com için çerezlere izin verin ya da o tarayıcıda diğer Google hesaplarından çıkış yapıp yeniden deneyin.',
    '<0>Task · done</0>': '<0>Görev · tamamlandı</0>',
    '<0>Task · done</0> for you': '<0>Görev · tamamlandı</0> sizin için',
    '<0>Task · done</0> for {0}': '<0>Görev · tamamlandı</0> {0} için',
    '<0>Task · open</0>': '<0>Görev · açık</0>',
    '<0>Task · open</0> for you': '<0>Görev · açık</0> sizin için',
    '<0>Task · open</0> for {0}': '<0>Görev · açık</0> {0} için',
    '<0>Threat to life or safety (DSA Art. 18).</0> Inform the police at once: the online reporting portal of the police of the German state concerned, or 110 if it is urgent. If it isn’t clear which country is concerned: the German authorities, or Europol. The content is kept as evidence until they have it.':
      '<0>Hayata veya güvenliğe yönelik tehdit (DSA madde 18).</0> Polise hemen bildirin: ilgili Alman eyaletinin polisinin çevrimiçi ihbar portalı ya da acilse 110. Hangi ülkenin ilgili olduğu belli değilse: Alman makamları ya da Europol. İçerik onlara ulaşana kadar delil olarak saklanır.',
    '<0>{0} new</0> Shared': '<0>{0} yeni</0> Paylaşılan',
    '<0>{0} new</0> Yours': '<0>{0} yeni</0> Sizin',
    '<0>“Add a task to Trip planning for @bo: book the hotel.”</0> After you invited someone on this site, they see it in their assistant and can mark it done.':
      '<0>“Trip planning oturumuna @bo için bir görev ekle: oteli ayırt.”</0> Birini bu sitede davet ettikten sonra görevi kendi asistanında görür ve tamamlandı olarak işaretleyebilir.',
    '<0>“Create a session called Trip planning and write a brief: Lisbon, 3–7 May, budget 1,500 €.”</0> Later, in another chat or assistant: “Load my Trip planning session. What’s still open?”':
      '<0>“Trip planning adında bir oturum oluştur ve bir özet yaz: Lizbon, 3–7 Mayıs, bütçe 1.500 €.”</0> Daha sonra başka bir sohbette ya da asistanda: “Trip planning oturumumu yükle. Hâlâ açık olan ne var?”',
    '<0>“Find public prompts for meeting notes and copy the best one to my prompts.”</0> It searches, shows you what it found, and copies the one you pick.':
      '<0>“Toplantı notları için herkese açık prompt’ları bul ve en iyisini prompt’larıma kopyala.”</0> Arar, bulduklarını size gösterir ve seçtiğinizi kopyalar.',
    '<0>“Not saved: this looks like a key or password.”</0> Others can read that session; remove the secret and save again.':
      '<0>“Kaydedilmedi: bu bir anahtar ya da parola gibi görünüyor.”</0> O oturumu başkaları okuyabilir; sırrı çıkarın ve yeniden kaydedin.',
    '<0>“Save this as a prompt called Code review, tagged review.”</0> Your assistant saves the text as a private prompt. Later, in any assistant: “Use my Code review prompt on this diff.”':
      '<0>“Bunu Code review adında, review etiketli bir prompt olarak kaydet.”</0> Asistanınız metni özel bir prompt olarak kaydeder. Daha sonra herhangi bir asistanda: “Code review prompt’umu bu diff üzerinde kullan.”',
    '<0>“This app hasn’t been allowed to do this.”</0> You didn’t tick that permission when signing in. Disconnect and connect again, and tick it.':
      '<0>“Bu uygulamanın bunu yapmasına izin verilmedi.”</0> Giriş yaparken o izni işaretlemediniz. Bağlantıyı kesip yeniden bağlanın ve işaretleyin.',
    '<0>“This session is full.”</0> Delete older entries, or start a new session.':
      '<0>“Bu oturum dolu.”</0> Eski kayıtları silin ya da yeni bir oturum başlatın.',
    '<0>“What did we decide about flights in Trip planning?”</0> It searches that session’s entries.':
      '<0>“Trip planning’de uçuşlar hakkında ne karar vermiştik?”</0> O oturumun kayıtlarında arar.',
    'A 2earl service. Sign-in by <0>login.2earl.com</0>.':
      'Bir 2earl hizmeti. Giriş <0>login.2earl.com</0> üzerinden.',
    'A new session, optionally starting from one of your prompts':
      'Yeni bir oturum; isteğe bağlı olarak prompt’larınızdan biriyle başlayarak',
    'A person will review it and email you the decision. Reference: {0}.':
      'Bir kişi inceleyecek ve kararı size e-postayla bildirecek. Referans: {0}.',
    'A person will review it and email you the decision. Reference: {0}. We also emailed you this confirmation.':
      'Bir kişi inceleyecek ve kararı size e-postayla bildirecek. Referans: {0}. Bu onayı size e-postayla da gönderdik.',
    'A person will review it, and we will email you our decision.':
      'Bir kişi inceleyecek ve kararımızı size e-postayla bildireceğiz.',
    'A person will review it. Reference: {0}.': 'Bir kişi inceleyecek. Referans: {0}.',
    'A prompt needs a title.': 'Bir prompt’un başlığı olmalı.',
    'A report from someone else': 'Başka birinden gelen bildirim',
    'A security log of actions (never their text), kept for 90 days.':
      'İşlemlerin bir güvenlik kaydı (metinleri asla), 90 gün saklanır.',
    'A session can have 20 members, counting open invitations. Remove someone or revoke a link first.':
      'Bir oturumun açık davetler dahil 20 üyesi olabilir. Önce birini çıkarın ya da bir bağlantıyı iptal edin.',
    'A shared session keeps where a conversation stands, so you can continue in another chat, another assistant, or with people you invite.':
      'Paylaşılan bir oturum bir konuşmanın nerede kaldığını tutar; böylece başka bir sohbette, başka bir asistanda ya da davet ettiğiniz kişilerle devam edebilirsiniz.',
    About: 'Hakkında',
    Account: 'Hesap',
    'Add a note, decision, question, task, summary or artifact':
      'Not, karar, soru, görev, özet ya da çıktı ekleyin',
    'Add an entry': 'Kayıt ekleyin',
    'Add entry': 'Kayıt ekle',
    'Add the address': 'Adresi ekleyin',
    'Add this address to your assistant': 'Bu adresi asistanınıza ekleyin',
    'Against the terms of use': 'Kullanım koşullarına aykırı',
    All: 'Tümü',
    'Anything else: <0>contact us</0>.': 'Diğer her şey için: <0>bize ulaşın</0>.',
    Artifact: 'Çıktı',
    Artifacts: 'Çıktılar',
    'Ask for what you need': 'İhtiyacınız olanı isteyin',
    'Assistants that show MCP prompts list your 50 newest prompts there, and <0>Resume a shared session</0>. Pick a prompt and it is sent as your message, with its <1/> filled in from what you type. Pick Resume, name a session, and the assistant reads its brief and what was saved after it. Only your own prompts are listed: text someone else wrote never goes out as your message.':
      'MCP prompt’larını gösteren asistanlar orada en yeni 50 prompt’unuzu ve <0>Paylaşılan bir oturuma devam et</0> seçeneğini listeler. Bir prompt seçin; yazdıklarınızla <1/> doldurularak mesajınız olarak gönderilir. Devam et’i seçip bir oturum adı verin; asistan oturumun özetini ve ondan sonra kaydedilenleri okur. Yalnızca kendi prompt’larınız listelenir: başkasının yazdığı metin asla sizin mesajınız olarak gitmez.',
    'Automated?': 'Otomatik mi?',
    'Before turning this on: enable the Cloudflare Workers Paid plan and onboard promptshare.cc in Email Service → Email Sending. Off: you send the decision yourself from the report’s page.':
      'Bunu açmadan önce: Cloudflare Workers Paid planını etkinleştirin ve promptshare.cc’yi Email Service → Email Sending’e ekleyin. Kapalı: kararı bildirimin sayfasından kendiniz gönderirsiniz.',
    Brief: 'Özet',
    'Brief history': 'Özet geçmişi',
    'By a 2earl user': 'Yazan: bir 2earl kullanıcısı',
    'By name or ID: the brief, open tasks, what changed, then entries':
      'Ada veya kimliğe göre: özet, açık görevler, değişenler, sonra kayıtlar',
    'By {0}': 'Yazan {0}',
    Cancel: 'İptal',
    'Change it': 'Değiştir',
    'Change one of yours; what it replaces is kept':
      'Kendinizinkilerden birini değiştirin; yerine geçtiği metin saklanır',
    'Check it holds nothing private: names, keys, internal details. Public prompts must follow the <0>terms of use</0>.':
      'Özel bir şey içermediğinden emin olun: adlar, anahtarlar, iç ayrıntılar. Herkese açık prompt’lar <0>kullanım koşullarına</0> uymalıdır.',
    'Choose a handle': 'Takma ad seçin',
    'Choose a handle first: it is shown as the author.':
      'Önce bir takma ad seçin: yazar olarak o gösterilir.',
    'Choose the ground: illegal content, or the terms of use.':
      'Gerekçeyi seçin: yasa dışı içerik ya da kullanım koşulları.',
    'Choose why you are reporting it.': 'Neden bildirdiğinizi seçin.',
    'Close without a decision': 'Karar vermeden kapat',
    Closed: 'Kapalı',
    'Closed {0}.': '{0} kapatıldı.',
    'Confirm that the report is accurate and made in good faith.':
      'Bildirimin doğru olduğunu ve iyi niyetle yapıldığını onaylayın.',
    Confirmed: 'Onaylandı',
    Connect: 'Bağlan',
    Contact: 'İletişim',
    Content: 'İçerik',
    Contest: 'İtiraz',
    'Contest the decision': 'Karara itiraz edin',
    'Contest {0}': 'İtiraz {0}',
    'Copies other people made stay theirs. This can’t be undone.':
      'Başkalarının yaptığı kopyalar onlarda kalır. Bu geri alınamaz.',
    'Copy a public or shared prompt into yours':
      'Herkese açık ya da paylaşılan bir prompt’u kendinizinkilere kopyalayın',
    'Copy to my prompts': 'Prompt’larıma kopyala',
    Create: 'Oluştur',
    'Create link': 'Bağlantı oluştur',
    'Create, change and delete your prompts': 'Prompt’larınızı oluşturma, değiştirme ve silme',
    Current: 'Güncel',
    Date: 'Tarih',
    Decide: 'Karar ver',
    Decision: 'Karar',
    Decisions: 'Kararlar',
    Delete: 'Sil',
    'Delete a session you own': 'Sahibi olduğunuz bir oturumu silin',
    'Delete an entry you wrote': 'Yazdığınız bir kaydı silin',
    'Delete one of yours': 'Kendinizinkilerden birini silin',
    'Delete prompt': 'Prompt’u sil',
    'Delete prompt “{0}”?': '“{0}” prompt’u silinsin mi?',
    'Delete session': 'Oturumu sil',
    'Delete session “{0}”?': '“{0}” oturumu silinsin mi?',
    Does: 'Yapar',
    'Download as Markdown': 'Markdown olarak indir',
    'Download everything Prompt share holds about you, or delete your account, from <0>your 2earl account</0>. Deleting it deletes your prompts, your sessions and your entries in other people’s sessions.':
      'Prompt share’in hakkınızda tuttuğu her şeyi indirin ya da hesabınızı silin: <0>2earl hesabınızdan</0>. Silmek prompt’larınızı, oturumlarınızı ve başkalarının oturumlarındaki kayıtlarınızı siler.',
    'Download or delete everything from your <0>2earl account</0>. Details: <1>privacy policy</1>.':
      'Her şeyi <0>2earl hesabınızdan</0> indirin ya da silin. Ayrıntılar: <1>gizlilik politikası</1>.',
    'Earlier versions': 'Eski sürümler',
    'Earlier versions of one of yours': 'Kendinizinkilerden birinin eski sürümleri',
    'Earlier versions: {0}': 'Eski sürümler: {0}',
    'Edit the brief': 'Özeti düzenleyin',
    Email: 'E-posta',
    'Email address of their 2earl account': '2earl hesaplarının e-posta adresi',
    'Email reporters a confirmation of receipt and the decision, from noreply@promptshare.cc':
      'Bildirenlere, noreply@promptshare.cc adresinden alındı onayı ve kararı e-postayla gönder',
    'Email the reporter the decision': 'Kararı bildirene e-postayla gönder',
    'Email, for the answer': 'Yanıt için e-posta',
    'Emailed automatically': 'Otomatik olarak e-postayla gönderildi',
    'Emailed to you': 'Size e-postayla gönderildi',
    'Enter an email address we can answer.': 'Yanıt verebileceğimiz bir e-posta adresi girin.',
    'Enter your email address, so we can tell you what we decided.':
      'Ne karar verdiğimizi bildirebilmemiz için e-posta adresinizi girin.',
    'Enter your name.': 'Adınızı girin.',
    Entries: 'Kayıtlar',
    'Entry in “{0}”': '“{0}” oturumundaki kayıt',
    'Every entry is deleted, for every member. This can’t be undone.':
      'Her kayıt, her üye için silinir. Bu geri alınamaz.',
    'Every signed-in 2earl user will be able to find, read and copy it, shown exactly like this, with your handle <0>{0}</0>. Copies people make stay theirs, even if you make it private again later.':
      'Giriş yapmış her 2earl kullanıcısı onu, tam olarak böyle ve <0>{0}</0> takma adınızla bulabilecek, okuyabilecek ve kopyalayabilecek. İnsanların yaptığı kopyalar, siz onu daha sonra yeniden özel yapsanız bile onlarda kalır.',
    Examples: 'Örnekler',
    'Explain the decision: the author reads this as the statement of reasons.':
      'Kararı açıklayın: yazar bunu gerekçe beyanı olarak okur.',
    'Explain why': 'Nedenini açıklayın',
    'Explain why the content is illegal or breaks the terms.':
      'İçeriğin neden yasa dışı olduğunu ya da koşulları çiğnediğini açıklayın.',
    Explore: 'Keşfet',
    'Explore public prompts': 'Herkese açık prompt’ları keşfedin',
    'Find entries in one session': 'Bir oturumdaki kayıtları bulun',
    'Go back to an earlier version': 'Eski bir sürüme dönün',
    'Go to the start page': 'Ana sayfaya gidin',
    'Good faith': 'İyi niyet',
    Ground: 'Gerekçe',
    Handle: 'Takma ad',
    'Hello {0},': 'Merhaba {0},',
    'Hello,': 'Merhaba,',
    'How to connect': 'Nasıl bağlanılır',
    'I believe what I am reporting is accurate and complete, and I report it in good faith.':
      'Bildirdiğim şeyin doğru ve eksiksiz olduğuna inanıyorum ve iyi niyetle bildiriyorum.',
    'I consent': 'Rıza gösteriyorum',
    'I don’t consent': 'Rıza göstermiyorum',
    'I explicitly consent to Prompt share storing health information and other special categories of personal data (Art. 9 GDPR) that I choose to save in my prompts and shared sessions, only to keep them for me and show them to the people I share them with. I can withdraw this consent at any time on my account page.':
      'Prompt’larımda ve paylaşılan oturumlarımda kaydetmeyi seçtiğim sağlık bilgilerini ve diğer özel nitelikli kişisel verileri (GDPR madde 9) Prompt share’in, yalnızca benim için saklamak ve paylaştığım kişilere göstermek amacıyla saklamasına açıkça rıza gösteriyorum. Bu rızayı hesap sayfamdan istediğim zaman geri alabilirim.',
    'If sending fails, reporters still see their confirmation on the page, and each report’s page offers the decision email for you to send, as when this is off.':
      'Gönderim başarısız olursa bildirenler onaylarını yine sayfada görür ve her bildirimin sayfası, bu kapalıyken olduğu gibi, karar e-postasını sizin göndermeniz için sunar.',
    'If something doesn’t work': 'Bir şey çalışmazsa',
    'If you didn’t send this report, you can ignore this email.':
      'Bu bildirimi siz göndermediyseniz bu e-postayı yok sayabilirsiniz.',
    'If you disagree': 'Katılmıyorsanız',
    'If you withdraw consent, Prompt share can’t find such information for you: delete the prompts and entries that hold it, or your whole account at <0>login.2earl.com</0>.':
      'Rızanızı geri alırsanız Prompt share bu tür bilgileri sizin için bulamaz: onları içeren prompt’ları ve kayıtları ya da <0>login.2earl.com</0> adresinden tüm hesabınızı silin.',
    'Illegal content': 'Yasa dışı içerik',
    Imprint: 'Künye',
    'In your assistant, add a custom connector (or "MCP server") with the address above. In Claude: Settings → Connectors → Add custom connector.':
      'Asistanınızda yukarıdaki adresle özel bir bağlayıcı (ya da "MCP sunucusu") ekleyin. Claude’da: Settings → Connectors → Add custom connector.',
    'Invite someone': 'Birini davet edin',
    'It breaks the terms of use': 'Kullanım koşullarını çiğniyor',
    'It involves child sexual abuse': 'Çocuk cinsel istismarı içeriyor',
    'It is illegal': 'Yasa dışı',
    Join: 'Katıl',
    'Join a shared session': 'Paylaşılan bir oturuma katılın',
    'Join “{0}”?': '“{0}” oturumuna katılınsın mı?',
    'Keep it': 'Tut',
    'Keep it private': 'Özel tut',
    Kind: 'Tür',
    Label: 'Etiket',
    'Label and assignee': 'Etiket ve atanan kişi',
    Language: 'Dil',
    Launch: 'Başlat',
    'Leave session': 'Oturumdan ayrıl',
    'Leave this empty, or enter an email address we can answer.':
      'Bunu boş bırakın ya da yanıt verebileceğimiz bir e-posta adresi girin.',
    Limits: 'Sınırlar',
    'Link for someone who can add entries': 'Kayıt ekleyebilecek biri için bağlantı',
    'Link for someone who can read': 'Okuyabilecek biri için bağlantı',
    'Link not valid': 'Bağlantı geçerli değil',
    'Link to the content': 'İçeriğin bağlantısı',
    Main: 'Ana menü',
    'Make public': 'Herkese açık yap',
    'Make public…': 'Herkese açık yap…',
    'Make this prompt public?': 'Bu prompt herkese açık yapılsın mı?',
    'Make your public prompt private': 'Herkese açık prompt’unuzu özel yapın',
    'Making a prompt public, sharing it with someone, and inviting people to a session are only possible here on the website, never through an assistant: text an assistant reads can’t make it share your things.':
      'Bir prompt’u herkese açık yapmak, biriyle paylaşmak ve kişileri bir oturuma davet etmek yalnızca burada, web sitesinde mümkündür, asla bir asistan üzerinden değil: bir asistanın okuduğu metin onun sizin şeylerinizi paylaşmasına yol açamaz.',
    'Mark a task done, or assign it': 'Bir görevi tamamlandı olarak işaretleyin ya da atayın',
    'Mark done': 'Tamamlandı olarak işaretle',
    Message: 'Mesaj',
    'Message sent': 'Mesaj gönderildi',
    Moderation: 'Moderasyon',
    'Moderation decision': 'Moderasyon kararı',
    'Moderation decisions about your content': 'İçeriğinizle ilgili moderasyon kararları',
    'Moderation suspended your publishing until {0}. See your account page for the reasons.':
      'Moderasyon, yayımlama hakkınızı {0} tarihine kadar askıya aldı. Gerekçeler için hesap sayfanıza bakın.',
    Name: 'Ad',
    'Name and email are needed unless the report concerns child sexual abuse.':
      'Bildirim çocuk cinsel istismarıyla ilgili değilse ad ve e-posta gereklidir.',
    'Name the law the content breaks.': 'İçeriğin çiğnediği yasayı belirtin.',
    'New invitation link': 'Yeni davet bağlantısı',
    'New prompt': 'Yeni prompt',
    'New session': 'Yeni oturum',
    'New tools don’t appear.': 'Yeni araçlar görünmüyor.',
    No: 'Hayır',
    'No action': 'İşlem yok',
    'No brief yet. The brief says where things stand: the goal, decisions, open questions and next steps. Assistants read it first.':
      'Henüz özet yok. Özet işlerin nerede olduğunu söyler: hedef, kararlar, açık sorular ve sonraki adımlar. Asistanlar önce onu okur.',
    'No earlier versions yet. One is kept each time you change the prompt.':
      'Henüz eski sürüm yok. Prompt’u her değiştirdiğinizde bir sürüm saklanır.',
    'No entries yet. Ask your assistant to save where your conversation stands, or add one above.':
      'Henüz kayıt yok. Asistanınızdan konuşmanızın nerede kaldığını kaydetmesini isteyin ya da yukarıdan bir tane ekleyin.',
    'No prompts match.': 'Eşleşen prompt yok.',
    'No prompts yet. Save one here, or ask your assistant to save one.':
      'Henüz prompt yok. Burada bir tane kaydedin ya da asistanınızdan kaydetmesini isteyin.',
    'No public prompts match.': 'Eşleşen herkese açık prompt yok.',
    'No public prompts yet.': 'Henüz herkese açık prompt yok.',
    'No sessions yet.': 'Henüz oturum yok.',
    'No shared prompts match.': 'Eşleşen paylaşılan prompt yok.',
    'No. A person reviewed the content and decided.':
      'Hayır. İçeriği bir kişi inceledi ve karar verdi.',
    Nobody: 'Kimse',
    'Not allowed': 'İzin verilmiyor',
    'Not emailed': 'E-postayla gönderilmedi',
    'Not found': 'Bulunamadı',
    'Not made public': 'Herkese açık yapılmadı',
    'Not now': 'Şimdi değil',
    'Not saved: the brief was changed by another member while you were editing. That version is shown above and your text is still in the box. Combine the two and save again.':
      'Kaydedilmedi: siz düzenlerken özet başka bir üye tarafından değiştirildi. O sürüm yukarıda gösteriliyor ve sizin metniniz hâlâ kutuda. İkisini birleştirip yeniden kaydedin.',
    'Not saved: this looks like a {0}, and other people can read this session. Remove it and save again.':
      'Kaydedilmedi: bu bir {0} gibi görünüyor ve bu oturumu başka kişiler okuyabilir. Onu çıkarın ve yeniden kaydedin.',
    'Not signed in': 'Giriş yapılmadı',
    Note: 'Not',
    Notes: 'Notlar',
    'Nothing closed yet.': 'Henüz kapatılan bir şey yok.',
    'Nothing shared with you yet.': 'Henüz sizinle paylaşılan bir şey yok.',
    'Nothing to review. New reports, contests and contact messages appear here.':
      'İncelenecek bir şey yok. Yeni bildirimler, itirazlar ve iletişim mesajları burada görünür.',
    'One prompt with its text; fills its {{variables}}':
      'Metniyle tek bir prompt; {{değişkenlerini}} doldurur',
    'Only join sessions of people you trust. What they write there reaches your assistant when it loads the session.':
      'Yalnızca güvendiğiniz kişilerin oturumlarına katılın. Orada yazdıkları, asistanınız oturumu yüklediğinde ona ulaşır.',
    Open: 'Açık',
    'Or paste this address into your browser:': 'Ya da bu adresi tarayıcınıza yapıştırın:',
    'Others see you as <0>{0}</0>. <1>Change it</1>':
      'Diğerleri sizi <0>{0}</0> olarak görür. <1>Değiştir</1>',
    'Our decision on your report': 'Bildiriminizle ilgili kararımız',
    'Our decision: {0}.': 'Kararımız: {0}.',
    'Part {0} of {1}': 'Bölüm {0}/{1}',
    'Paste the link to the content, starting with https://promptshare.cc/.':
      'İçeriğin bağlantısını https://promptshare.cc/ ile başlayacak şekilde yapıştırın.',
    People: 'Kişiler',
    'People and settings': 'Kişiler ve ayarlar',
    Privacy: 'Gizlilik',
    'Private: only you and the {0} people you shared it with can see it. Changed <0>{1}</0>.':
      'Özel: yalnızca siz ve paylaştığınız {0} kişi görebilir. <0>{1}</0> değiştirildi.',
    'Private: only you and the {0} person you shared it with can see it. Changed <0>{1}</0>.':
      'Özel: yalnızca siz ve paylaştığınız {0} kişi görebilir. <0>{1}</0> değiştirildi.',
    'Private: only you can see it. Changed <0>{0}</0>.':
      'Özel: yalnızca siz görebilirsiniz. <0>{0}</0> değiştirildi.',
    'Private: only you can see it. Changed <0>{0}</0>. <1>{1}</1>.':
      'Özel: yalnızca siz görebilirsiniz. <0>{0}</0> değiştirildi. <1>{1}</1>.',
    'Prompt by {0}': '{0} tarafından prompt',
    'Prompt share keeps the prompts you reuse and the notes you want to keep, so you can use them from any assistant, and share them with people you choose. It stores only what you or your assistant save; it never reads your chat history.':
      'Prompt share, yeniden kullandığınız prompt’ları ve saklamak istediğiniz notları tutar; böylece onları herhangi bir asistandan kullanabilir ve seçtiğiniz kişilerle paylaşabilirsiniz. Yalnızca sizin ya da asistanınızın kaydettiklerini saklar; sohbet geçmişinizi asla okumaz.',
    'Prompt share keeps your prompts and the state of your conversations, so you can pick them up in Claude, ChatGPT, Cursor or any MCP client, in a new chat, or with people you invite.':
      'Prompt share, prompt’larınızı ve konuşmalarınızın durumunu tutar; böylece onlara Claude, ChatGPT, Cursor ya da herhangi bir MCP istemcisinde, yeni bir sohbette veya davet ettiğiniz kişilerle devam edebilirsiniz.',
    'Prompt share: test email': 'Prompt share: deneme e-postası',
    Prompts: 'Prompt’lar',
    'Prompts other 2earl users chose to share. Copy one into your own prompts to use or change it.':
      'Diğer 2earl kullanıcılarının paylaşmayı seçtiği prompt’lar. Kullanmak ya da değiştirmek için birini kendi prompt’larınıza kopyalayın.',
    'Prompts other 2earl users shared with your address. Copy one to change it.':
      'Diğer 2earl kullanıcılarının adresinizle paylaştığı prompt’lar. Değiştirmek için birini kopyalayın.',
    'Prompts up to 32 KB, 2,000 per account. Session entries up to 64 KB, briefs up to 16 KB, 5 MB per session, 50 sessions per account, 20 members per session.':
      'Prompt’lar en fazla 32 KB, hesap başına 2.000. Oturum kayıtları en fazla 64 KB, özetler en fazla 16 KB, oturum başına 5 MB, hesap başına 50 oturum, oturum başına 20 üye.',
    Public: 'Herkese açık',
    'Public prompts': 'Herkese açık prompt’lar',
    'Public: every signed-in 2earl user can find and copy it. Changed <0>{0}</0>.':
      'Herkese açık: giriş yapmış her 2earl kullanıcısı bulabilir ve kopyalayabilir. <0>{0}</0> değiştirildi.',
    'Public: every signed-in 2earl user can find and copy it. Changed <0>{0}</0>. <1>{1}</1>.':
      'Herkese açık: giriş yapmış her 2earl kullanıcısı bulabilir ve kopyalayabilir. <0>{0}</0> değiştirildi. <1>{1}</1>.',
    Question: 'Soru',
    Questions: 'Sorular',
    'Questions, problems, or anything about your data. You can also write to <0>legal@2earl.com</0>. To report content, use <1>Report content</1>.':
      'Sorular, sorunlar ya da verilerinizle ilgili her şey. <0>legal@2earl.com</0> adresine de yazabilirsiniz. İçerik bildirmek için <1>İçerik bildir</1>’i kullanın.',
    'Read your prompts, prompts shared with you, and public prompts':
      'Prompt’larınızı, sizinle paylaşılan prompt’ları ve herkese açık prompt’ları okuma',
    Reason: 'Gerekçe',
    Reasons: 'Gerekçeler',
    'Receipt to reporter': 'Bildirene alındı onayı',
    Received: 'Alındı',
    Reference: 'Referans',
    'Release notes': 'Sürüm notları',
    Remove: 'Kaldır',
    'Remove from my list': 'Listemden kaldır',
    'Remove: hide it from everyone': 'Kaldır: herkesten gizle',
    Rename: 'Yeniden adlandır',
    'Rename a session you own': 'Sahibi olduğunuz bir oturumu yeniden adlandırın',
    Reopen: 'Yeniden aç',
    'Replace the brief without overwriting a newer one; earlier versions stay':
      'Özeti daha yeni bir sürümün üzerine yazmadan değiştirin; eski sürümler kalır',
    Reply: 'Yanıtla',
    'Reply to this email to reach a person.': 'Bir kişiye ulaşmak için bu e-postayı yanıtlayın.',
    Report: 'Bildir',
    'Report content': 'İçerik bildir',
    'Report received': 'Bildirim alındı',
    'Report {0}': 'Bildirim {0}',
    'Reports, contests and messages, oldest first. Reports need a decision without undue delay.':
      'Bildirimler, itirazlar ve mesajlar, en eskisi önce. Bildirimler gecikmeden karar gerektirir.',
    'Required by the DSA (Art. 16(5)); opens your mail app.':
      'DSA (madde 16(5)) gereği; e-posta uygulamanızı açar.',
    'Restore this version': 'Bu sürümü geri yükle',
    'Restoring it changes the text like this:': 'Geri yüklemek metni şöyle değiştirir:',
    'Restrict: make it private; it can’t be made public again':
      'Kısıtla: özel yap; yeniden herkese açık yapılamaz',
    'Resume a shared session': 'Paylaşılan bir oturuma devam et',
    'Reverse an earlier decision: restore the content, lift a suspension':
      'Önceki bir kararı geri al: içeriği geri getir, askıyı kaldır',
    Review: 'Gözden geçir',
    Revoke: 'İptal et',
    'Save a new private prompt': 'Yeni bir özel prompt kaydedin',
    'Save brief': 'Özeti kaydet',
    'Save changes': 'Değişiklikleri kaydet',
    'Save handle': 'Takma adı kaydet',
    'Save prompt': 'Prompt’u kaydet',
    'Save settings': 'Ayarları kaydet',
    'Save the prompts you reuse, with <0/> to fill in each time. Pick them from your assistant’s prompt menu, or just ask for one. Every change keeps the earlier version. Private unless you publish.':
      'Yeniden kullandığınız prompt’ları her seferinde doldurulacak <0/> ile kaydedin. Asistanınızın prompt menüsünden seçin ya da yalnızca isteyin. Her değişiklik eski sürümü saklar. Yayımlamadıkça özeldir.',
    'Save to and read your shared sessions': 'Paylaşılan oturumlarınıza kaydetme ve onları okuma',
    'Save where a conversation stands: a brief, decisions, tasks. Pick it up in another chat or another assistant with “Resume a shared session”, or with people you invite.':
      'Bir konuşmanın nerede kaldığını kaydedin: özet, kararlar, görevler. “Paylaşılan bir oturuma devam et” ile başka bir sohbette ya da başka bir asistanda veya davet ettiğiniz kişilerle devam edin.',
    Search: 'Ara',
    'Search by words; or list the newest': 'Kelimelerle arayın ya da en yenileri listeleyin',
    'Search prompts shared with you': 'Sizinle paylaşılan prompt’larda arayın',
    'Search public prompts': 'Herkese açık prompt’larda arayın',
    'Search this session': 'Bu oturumda arayın',
    'Search your prompts': 'Prompt’larınızda arayın',
    'Search: {0}': 'Arama: {0}',
    'See the examples below.': 'Aşağıdaki örneklere bakın.',
    'Send a test email': 'Deneme e-postası gönder',
    'Send it to one person you trust. Everything in this session will be visible to them, and what they write reaches your assistant.':
      'Güvendiğiniz tek bir kişiye gönderin. Bu oturumdaki her şey ona görünür olacak ve yazdıkları asistanınıza ulaşır.',
    'Send message': 'Mesajı gönder',
    'Send report': 'Bildirimi gönder',
    'Send test': 'Deneme gönder',
    'Sending to any address works.': 'Herhangi bir adrese gönderim çalışıyor.',
    'Sensitive information': 'Hassas bilgiler',
    'Sent to {0}. Sending to any address works.':
      '{0} adresine gönderildi. Herhangi bir adrese gönderim çalışıyor.',
    'Session briefs and entries: only text you, your assistant or a member you invited chose to save, encrypted, with who wrote it and when. Prompt share never records your conversations on its own.':
      'Oturum özetleri ve kayıtları: yalnızca sizin, asistanınızın ya da davet ettiğiniz bir üyenin kaydetmeyi seçtiği metin, şifrelenmiş olarak, kimin ne zaman yazdığıyla birlikte. Prompt share konuşmalarınızı kendiliğinden asla kaydetmez.',
    'Session text is encrypted. Nothing is saved unless you or your assistant save it. Download or delete everything from your 2earl account.':
      'Oturum metni şifrelenir. Siz ya da asistanınız kaydetmedikçe hiçbir şey kaydedilmez. Her şeyi 2earl hesabınızdan indirin ya da silin.',
    Sessions: 'Oturumlar',
    Settings: 'Ayarlar',
    Share: 'Paylaş',
    'Share with people': 'Kişilerle paylaşın',
    Shared: 'Paylaşılan',
    'Shared sessions': 'Paylaşılan oturumlar',
    'Shared with you': 'Sizinle paylaşılanlar',
    'Shared with you by {0}': '{0} tarafından sizinle paylaşıldı',
    'Shared with {0}.': '{0} ile paylaşıldı.',
    'Shorten the explanation to 10,000 characters.': 'Açıklamayı 10.000 karaktere kısaltın.',
    'Shorten the explanation.': 'Açıklamayı kısaltın.',
    'Shorten the message to 10,000 characters.': 'Mesajı 10.000 karaktere kısaltın.',
    'Shorten the name.': 'Adı kısaltın.',
    'Show entries of one kind': 'Bir türdeki kayıtları göster',
    'Show the whole text': 'Metnin tamamını göster',
    'Sign in': 'Giriş yap',
    'Sign in with 2earl': '2earl ile giriş yapın',
    'Sign out': 'Çıkış yap',
    'Sign-in asks again and again.': 'Giriş tekrar tekrar soruluyor.',
    'Sign-in didn’t complete. Start again.': 'Giriş tamamlanmadı. Yeniden başlayın.',
    'Sign-in was cancelled or not allowed.': 'Giriş iptal edildi ya da izin verilmedi.',
    'Skip to content': 'İçeriğe geç',
    'Some people keep notes about their health, beliefs or similar private matters in their prompts or sessions. The law protects this kind of information specially, so Prompt share stores it only with your explicit consent.':
      'Bazı kişiler prompt’larında ya da oturumlarında sağlıkları, inançları veya benzeri özel konular hakkında notlar tutar. Hukuk bu tür bilgileri özel olarak korur; bu yüzden Prompt share onları yalnızca açık rızanızla saklar.',
    'Something went wrong': 'Bir şeyler ters gitti',
    'Started by': 'Başlatan',
    'Statement of reasons': 'Gerekçe beyanı',
    'Stop sharing': 'Paylaşmayı durdur',
    Summaries: 'Özetler',
    Summary: 'Özet',
    'Suspend for 1 to {0} days.': '1 ile {0} gün arasında askıya alın.',
    'Suspend the author’s publishing, and restrict this content':
      'Yazarın yayımlamasını askıya al ve bu içeriği kısıtla',
    'Suspension in days': 'Gün olarak askıya alma',
    Task: 'Görev',
    'Task · done': 'Görev · tamamlandı',
    'Task · open': 'Görev · açık',
    Tasks: 'Görevler',
    'Tell us about a prompt or session entry on Prompt share that is illegal or breaks the <0>terms of use</0>. Anyone can report, with or without an account. A person reads every report.':
      'Prompt share’de yasa dışı olan ya da <0>kullanım koşullarını</0> çiğneyen bir prompt’u veya oturum kaydını bize bildirin. Hesabı olsun ya da olmasın herkes bildirimde bulunabilir. Her bildirimi bir kişi okur.',
    'Tell us why, and a person will review the decision again. You can also turn to an out-of-court dispute settlement body or a court.':
      'Nedenini söyleyin; bir kişi kararı yeniden inceleyecek. Mahkeme dışı bir uyuşmazlık çözüm kuruluşuna ya da mahkemeye de başvurabilirsiniz.',
    Terms: 'Koşullar',
    'Test email': 'Deneme e-postası',
    'That handle is reserved. Choose another.': 'Bu takma ad ayrılmış. Başka birini seçin.',
    'That handle is taken. Choose another.': 'Bu takma ad alınmış. Başka birini seçin.',
    'The content': 'İçerik',
    'The decision contested': 'İtiraz edilen karar',
    'The decision was emailed to the reporter automatically, {0}.':
      'Karar bildirene otomatik olarak e-postayla gönderildi, {0}.',
    'The decision was made by a person, not by automated means. If you disagree, reply to this email.':
      'Karar otomatik yollarla değil, bir kişi tarafından verildi. Katılmıyorsanız bu e-postayı yanıtlayın.',
    'The last 20 versions of the brief, newest first.': 'Özetin son 20 sürümü, en yenisi önce.',
    'The link doesn’t point at a prompt or session entry on Prompt share, or the content no longer exists.':
      'Bağlantı Prompt share’deki bir prompt’u ya da oturum kaydını göstermiyor ya da içerik artık yok.',
    'The newest 10 are kept, only for you. Restoring one keeps the current text as a version too, so you can go back.':
      'En yeni 10 sürüm yalnızca sizin için saklanır. Birini geri yüklemek güncel metni de bir sürüm olarak saklar; böylece geri dönebilirsiniz.',
    'The reporter gave no email address.': 'Bildiren e-posta adresi vermedi.',
    'The text is the same as now.': 'Metin şimdikiyle aynı.',
    'The text is too long to compare line by line.':
      'Metin satır satır karşılaştırmak için fazla uzun.',
    'Their objection': 'İtirazları',
    'There is no such decision, or you can’t see it.':
      'Böyle bir karar yok ya da onu göremezsiniz.',
    'There is no such member, or you can’t see it.': 'Böyle bir üye yok ya da onu göremezsiniz.',
    'There is no such page, or you can’t see it.': 'Böyle bir sayfa yok ya da onu göremezsiniz.',
    'There is no such prompt, or you can’t see it.': 'Böyle bir prompt yok ya da onu göremezsiniz.',
    'There is no such session, or you can’t see it.':
      'Böyle bir oturum yok ya da onu göremezsiniz.',
    'There is no such share, or you can’t see it.':
      'Böyle bir paylaşım yok ya da onu göremezsiniz.',
    'They can add entries': 'Kayıt ekleyebilirler',
    'They can only read': 'Yalnızca okuyabilirler',
    'They can read and copy this prompt on promptshare.cc and through their assistant, with your handle as who shared it. They see your changes, but can’t make any. Prompt share doesn’t email them: they find it under “Shared with you”.':
      'Bu prompt’u promptshare.cc’de ve asistanları üzerinden, paylaşan olarak takma adınızla birlikte okuyabilir ve kopyalayabilirler. Değişikliklerinizi görürler ama kendileri değişiklik yapamazlar. Prompt share onlara e-posta göndermez: onu “Sizinle paylaşılanlar” altında bulurlar.',
    'This form must be sent from promptshare.cc.': 'Bu form promptshare.cc’den gönderilmelidir.',
    'This invitation link was used, revoked or has expired.':
      'Bu davet bağlantısı kullanılmış, iptal edilmiş ya da süresi dolmuş.',
    'This invitation link was used, revoked or has expired. Ask for a new one.':
      'Bu davet bağlantısı kullanılmış, iptal edilmiş ya da süresi dolmuş. Yenisini isteyin.',
    'This is a test from the Prompt share moderation settings. Sending to any address works.':
      'Bu, Prompt share moderasyon ayarlarından bir deneme. Herhangi bir adrese gönderim çalışıyor.',
    'This prompt was restricted by moderation and can’t be made public.':
      'Bu prompt moderasyon tarafından kısıtlandı ve herkese açık yapılamaz.',
    'This report’s link doesn’t point at content on Prompt share.':
      'Bu bildirimin bağlantısı Prompt share’deki bir içeriği göstermiyor.',
    'This session is large, so it comes in {0} files, oldest entries first. The brief is in part 1.':
      'Bu oturum büyük olduğu için {0} dosya halinde gelir, en eski kayıtlar önce. Özet 1. bölümdedir.',
    'Threat to life or safety: remove, keep as evidence, inform the police (Art. 18)':
      'Hayata veya güvenliğe yönelik tehdit: kaldır, delil olarak sakla, polise bildir (madde 18)',
    Title: 'Başlık',
    'To fill in when you use it: <0/>. Your assistant asks for these, or takes them from the conversation.':
      'Kullanırken doldurulacaklar: <0/>. Asistanınız bunları sorar ya da konuşmadan alır.',
    'Too many attempts': 'Çok fazla deneme',
    'Too many messages': 'Çok fazla mesaj',
    'Too many reports': 'Çok fazla bildirim',
    Tool: 'Araç',
    Tools: 'Araçlar',
    'Try again in a moment.': 'Biraz sonra yeniden deneyin.',
    'Use 3 to 30 lowercase letters, digits or hyphens, starting and ending with a letter or digit.':
      'Bir harf ya da rakamla başlayıp biten 3 ile 30 arasında küçük harf, rakam veya tire kullanın.',
    'Wait a minute and send it again.': 'Bir dakika bekleyip yeniden gönderin.',
    'Wait a minute and try again.': 'Bir dakika bekleyip yeniden deneyin.',
    'We received your report': 'Bildiriminizi aldık',
    'We received your report (reference {0}). A person will review it.':
      'Bildiriminizi aldık (referans {0}). Bir kişi inceleyecek.',
    'We’ll answer by email. Reference: {0}.': 'E-postayla yanıt vereceğiz. Referans: {0}.',
    'What is stored': 'Neler saklanır',
    'What it is for <0>optional</0>': 'Ne için olduğu <0>isteğe bağlı</0>',
    'What you can do': 'Neler yapabilirsiniz',
    'What your assistant can be allowed to do, by permission. Claude asks you before every tool that changes something.':
      'Asistanınıza izin bazında neler yaptırılabileceği. Claude bir şeyi değiştiren her araçtan önce size sorar.',
    'Which date?': 'Hangi tarih?',
    'Which messages': 'Hangi mesajlar',
    'Why are you reporting it?': 'Neden bildiriyorsunuz?',
    'Why the decision is wrong': 'Karar neden yanlış',
    'Withdraw consent': 'Rızayı geri al',
    'Words to find': 'Aranacak kelimeler',
    'Write a prompt once.<0/>Use it in every assistant.':
      'Bir prompt’u bir kez yazın.<0/>Her asistanda kullanın.',
    'Write the brief': 'Özeti yazın',
    'Write your message.': 'Mesajınızı yazın.',
    You: 'Siz',
    'You are already a member.': 'Zaten üyesiniz.',
    'You are signed in with your 2earl account.': '2earl hesabınızla giriş yaptınız.',
    'You can add entries': 'Kayıt ekleyebilirsiniz',
    'You can also turn to an out-of-court dispute settlement body or a court.':
      'Mahkeme dışı bir uyuşmazlık çözüm kuruluşuna ya da mahkemeye de başvurabilirsiniz.',
    'You can read it': 'Okuyabilirsiniz',
    'You can read this session but not add to it.':
      'Bu oturumu okuyabilirsiniz ama ona ekleme yapamazsınız.',
    'You can read this session but not change it.':
      'Bu oturumu okuyabilirsiniz ama değiştiremezsiniz.',
    'You consented to Prompt share storing sensitive information you save. <0>Withdraw consent</0>':
      'Kaydettiğiniz hassas bilgileri Prompt share’in saklamasına rıza gösterdiniz. <0>Rızayı geri al</0>',
    'You contested this decision. A person will review it and you’ll see the outcome here.':
      'Bu karara itiraz ettiniz. Bir kişi inceleyecek ve sonucu burada göreceksiniz.',
    'You got this email because the Prompt share owner sent a test to this address.':
      'Bu e-postayı Prompt share sahibi bu adrese bir deneme gönderdiği için aldınız.',
    'You got this email because this address was given in a report to Prompt share.':
      'Bu e-postayı, bu adres Prompt share’e yapılan bir bildirimde verildiği için aldınız.',
    'You haven’t chosen a handle. You need one to make prompts public or share sessions. <0>Choose a handle</0>':
      'Henüz bir takma ad seçmediniz. Prompt’ları herkese açık yapmak ya da oturum paylaşmak için bir tane gerekir. <0>Takma ad seçin</0>',
    'You haven’t consented to Prompt share storing sensitive information, such as health details. <0>Review</0>':
      'Sağlık ayrıntıları gibi hassas bilgileri Prompt share’in saklamasına rıza göstermediniz. <0>Gözden geçir</0>',
    'You last answered on {0}: you consented.':
      'En son {0} tarihinde yanıtladınız: rıza gösterdiniz.',
    'You last answered on {0}: you didn’t consent.':
      'En son {0} tarihinde yanıtladınız: rıza göstermediniz.',
    'Your answer doesn’t change anything else: you can use Prompt share either way. Without consent, please don’t save such information.':
      'Yanıtınız başka hiçbir şeyi değiştirmez: Prompt share’i her iki durumda da kullanabilirsiniz. Rıza olmadan lütfen bu tür bilgileri kaydetmeyin.',
    'Your assistant opens login.2earl.com. Sign in with Google and tick what it may do. You can change this later by connecting again.':
      'Asistanınız login.2earl.com’u açar. Google ile giriş yapın ve neler yapabileceğini işaretleyin. Bunu daha sonra yeniden bağlanarak değiştirebilirsiniz.',
    'Your data': 'Verileriniz',
    'Your email, for our decision': 'Kararımız için e-postanız',
    'Your handle': 'Takma adınız',
    'Your handle is the only thing other 2earl users see of you: as the author of your public prompts, and in shared sessions. It isn’t your name or email.':
      'Takma adınız, diğer 2earl kullanıcılarının sizden gördüğü tek şeydir: herkese açık prompt’larınızın yazarı olarak ve paylaşılan oturumlarda. Adınız ya da e-postanız değildir.',
    'Your name': 'Adınız',
    'Your prompts': 'Prompt’larınız',
    'Your prompts in the prompt menu': 'Prompt menüsündeki prompt’larınız',
    'Your prompts, as you or your assistant saved them.':
      'Prompt’larınız, siz ya da asistanınız nasıl kaydettiyse öyle.',
    'Your prompts, in every assistant': 'Prompt’larınız, her asistanda',
    'Your report to Prompt share': 'Prompt share’e bildiriminiz',
    'Your sessions, with what’s new': 'Oturumlarınız ve yenilikler',
    Yours: 'Sizin',
    'a 2earl user': 'bir 2earl kullanıcısı',
    'a member without a handle': 'takma adı olmayan bir üye',
    'a short name, shown in bold': 'kalın gösterilen kısa bir ad',
    'abusive text': 'taciz edici metin',
    active: 'etkin',
    'an address that isn’t yours, to test sending to anyone':
      'herkese gönderimi denemek için size ait olmayan bir adres',
    'can add entries': 'kayıt ekleyebilir',
    'can read': 'okuyabilir',
    changed: 'değiştirildi',
    'changed <0>{0}</0>': '<0>{0}</0> değiştirildi',
    'contact us': 'bize ulaşın',
    'content on Prompt share': 'Prompt share’deki içerik',
    'e.g. Trip planning': 'ör. Gezi planı',
    'for a suspension': 'askıya alma için',
    'for a task': 'bir görev için',
    'for illegal content, e.g. § 186 StGB': 'yasa dışı içerik için, ör. § 186 StGB',
    'for you': 'sizin için',
    'for {0}': '{0} için',
    'from the guest': 'misafirden',
    'from the member': 'üyeden',
    'from {0}': '{0} tarafından',
    'just now': 'az önce',
    optional: 'isteğe bağlı',
    'optional, e.g. Claude, GPT-5': 'isteğe bağlı, ör. Claude, GPT-5',
    'optional, separated by commas': 'isteğe bağlı, virgülle ayrılmış',
    owner: 'sahip',
    'parts that change with each use can be variables: {{topic}}, or {{tone=friendly}} with a default':
      'her kullanımda değişen kısımlar değişken olabilir: {{topic}} ya da varsayılanıyla {{tone=friendly}}',
    'privacy policy': 'gizlilik politikası',
    private: 'özel',
    public: 'herkese açık',
    removed: 'kaldırıldı',
    restricted: 'kısıtlandı',
    'terms of use': 'kullanım koşulları',
    'thank you for your report of {0}.': '{0} bildiriminiz için teşekkür ederiz.',
    'the author reads this: facts, and why they lead to the decision':
      'bunu yazar okur: olgular ve neden bu karara yol açtıkları',
    'this entry': 'bu kayıt',
    'valid until <0>{0}</0>': '<0>{0}</0> tarihine kadar geçerli',
    'we received your report of {0}.': '{0} bildiriminizi aldık.',
    'works once, for 7 days': 'bir kez, 7 gün boyunca çalışır',
    yesterday: 'dün',
    'your 2earl account': '2earl hesabınız',
    '{0} earlier version': '{0} eski sürüm',
    '{0} earlier versions': '{0} eski sürüm',
    '{0} entries': '{0} kayıt',
    '{0} entries were saved after this brief. If they change where things stand, update it.':
      'Bu özetten sonra {0} kayıt kaydedildi. İşlerin durumunu değiştiriyorlarsa özeti güncelleyin.',
    '{0} entry': '{0} kayıt',
    '{0} entry was saved after this brief. If they change where things stand, update it.':
      'Bu özetten sonra {0} kayıt kaydedildi. İşlerin durumunu değiştiriyorlarsa özeti güncelleyin.',
    '{0} found in {1} entries.': '{1} kayıtta {0} sonuç bulundu.',
    '{0} found in {1} entry.': '{1} kayıtta {0} sonuç bulundu.',
    '{0} hour ago': '{0} saat önce',
    '{0} hours ago': '{0} saat önce',
    '{0} invited you to their shared session. You can read it and add entries.':
      '{0} sizi paylaşılan oturumuna davet etti. Okuyabilir ve kayıt ekleyebilirsiniz.',
    '{0} invited you to their shared session. You can read it.':
      '{0} sizi paylaşılan oturumuna davet etti. Okuyabilirsiniz.',
    '{0} member': '{0} üye',
    '{0} members': '{0} üye',
    '{0} minute ago': '{0} dakika önce',
    '{0} minutes ago': '{0} dakika önce',
    '{0} new': '{0} yeni',
    '“Add a task to Trip planning for @bo: book the hotel.”':
      '“Trip planning oturumuna @bo için bir görev ekle: oteli ayırt.”',
    '“Create a session called Trip planning and write a brief: Lisbon, 3–7 May, budget 1,500 €.”':
      '“Trip planning adında bir oturum oluştur ve bir özet yaz: Lizbon, 3–7 Mayıs, bütçe 1.500 €.”',
    '“Find public prompts for meeting notes and copy the best one to my prompts.”':
      '“Toplantı notları için herkese açık prompt’ları bul ve en iyisini prompt’larıma kopyala.”',
    '“Not saved: this looks like a key or password.”':
      '“Kaydedilmedi: bu bir anahtar ya da parola gibi görünüyor.”',
    '“Save this as a prompt called Code review, tagged review.”':
      '“Bunu Code review adında, review etiketli bir prompt olarak kaydet.”',
    '“This app hasn’t been allowed to do this.”': '“Bu uygulamanın bunu yapmasına izin verilmedi.”',
    '“This session is full.”': '“Bu oturum dolu.”',
    '“What did we decide about flights in Trip planning?”':
      '“Trip planning’de uçuşlar hakkında ne karar vermiştik?”',
  },
};
