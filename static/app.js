'use strict';

const ui = {
  root: document.getElementById('content'),
  lang: document.getElementById('language'),
  logout: document.getElementById('logout'),
  install: document.getElementById('install'),
  headerBack: document.getElementById('header-back')
};

let lang = localStorage.getItem('mile-language') === 'en' ? 'en' : 'pt';
let user = null, csrf = null, selected = null, folder = null, players = [], admins = [], docs = [], mode = '';
let loginMode = 'login';
let activationToken = new URLSearchParams(location.search).get('activate');
let installPrompt = null;
const splashStartedAt = performance.now();
if (activationToken) history.replaceState(null, '', location.pathname);

function dismissSplash(){
  const splash=document.getElementById('splash');
  if(!splash)return;
  const delay=Math.max(0,1600-(performance.now()-splashStartedAt));
  setTimeout(()=>{
    splash.classList.add('is-hidden');
    setTimeout(()=>splash.remove(),620);
  },delay);
}

const words = {
  pt: {
    private:'Área privada', hello:'Olá,', sub:'Os teus documentos, num só lugar.', folders:{weekly:'Planos semanais',nutrition:'Planos alimentares',menus:'Menus',other:'Outros documentos',anthropometry:'Avaliações antropométricas'},
    document:'documento',documents:'documentos',open:'Abrir',documentTitle:'Título apresentado ao jogador',editTitle:'Editar título',titlePrompt:'Título apresentado ao jogador:',back:'← Voltar',
    players:'Jogadores',management:'Administração',manageSub:'Gere acessos, jogadores e documentos a partir de um único painel.',newPlayer:'+ Criar jogador',manage:'Gerir',upload:'+ Carregar PDF',
    name:'Nome',username:'Username',password:'Palavra-passe',newPassword:'Nova palavra-passe',currentPassword:'Palavra-passe atual',enter:'Entrar',loginSub:'Acede à tua área privada.',create:'Criar conta',
    foot:'Nutrição. Performance. Detalhe.',logout:'Sair',install:'Instalar',save:'Guardar',cancel:'Cancelar',file:'Ficheiro PDF',pdfNote:'PDF até 20 MB.',empty:'Ainda não há documentos nesta pasta.',
    noPlayers:'Ainda não foram criados jogadores.',replace:'Substituir',remove:'Apagar',removeConfirm:'Queres apagar este documento?',inactive:'Desativado',active:'Ativo',
    deactivate:'Desativar',reactivate:'Reativar',statusConfirm:'Alterar o acesso deste jogador?',search:'Procurar jogador',administrators:'Administradores',noMatches:'Nenhum jogador encontrado.',
    adminSub:'Contas com acesso total à administração.',generateLink:'Gerar link',current:'Tu',overview:'Visão geral',totalPlayers:'Jogadores',activePlayers:'Ativos',inactivePlayers:'Desativados',totalDocuments:'Documentos',
    edit:'Editar dados',update:'Guardar alterações',deletePlayer:'Eliminar jogador',deletePlayerConfirm:'Eliminar este jogador e todos os seus documentos? Esta ação não pode ser anulada.',
    playerDetails:'Dados do jogador',birthDate:'Data de nascimento',sex:'Sexo',male:'Masculino',female:'Feminino',height:'Altura (cm)',weight:'Peso atual (kg)',photo:'Foto',planName:'Plano',renewalDate:'Data de renovação',menus:'Menus',anthropometry:'Avaliações antropométricas',
    enabled:'Ativo',disabled:'Inativo',resetPassword:'Alterar password',changePassword:'Alterar palavra-passe',passwordChanged:'Palavra-passe alterada.',profile:'Perfil do jogador',
    registerWeight:'Registar peso',postGame:'Pós-jogo',formsUnavailable:'Formulário ainda não configurado.',forgot:'Esqueci-me da palavra-passe',forgotText:'Contacta Filipe Sousa ou Raquel Gomes para redefinir o acesso.',changeAccess:'Alterar palavra-passe',backToLogin:'Voltar ao início de sessão',
    activate:'Definir palavra-passe',activateSub:'Escolhe uma palavra-passe.',confirm:'Confirmar palavra-passe',
    errors:{credentials:'Username/email ou palavra-passe incorretos.',login_required:'A sessão terminou. Entra novamente.',csrf:'Atualiza a página e tenta novamente.',origin:'Pedido não permitido.',
      password_length:'Usa pelo menos 8 caracteres.',password_change:'Verifica a palavra-passe atual e usa pelo menos 8 caracteres na nova.',activation:'O link expirou ou já foi utilizado.',
      username_exists:'Este username já existe.',photo:'Seleciona uma foto JPG, PNG ou WebP até 3 MB.',pdf_only:'Seleciona um ficheiro PDF válido.',file_size:'O ficheiro ultrapassa o limite permitido.',
      forbidden:'Não tens acesso a este conteúdo.',user_fields:'Verifica os dados do jogador.',rate_limit:'Demasiadas tentativas. Tenta novamente daqui a 15 minutos.',network:'Não foi possível ligar. Tenta novamente.',
      password_mismatch:'As palavras-passe não coincidem.',generic:'Não foi possível concluir. Tenta novamente.'}
  },
  en: {
    private:'Private area', hello:'Hello,', sub:'Your documents, all in one place.', folders:{weekly:'Weekly plans',nutrition:'Meal plans',menus:'Menus',other:'Other documents',anthropometry:'Anthropometric assessments'},
    document:'document',documents:'documents',open:'Open',documentTitle:'Title shown to the player',editTitle:'Edit title',titlePrompt:'Title shown to the player:',back:'← Back',
    players:'Players',management:'Administration',manageSub:'Manage access, players and documents from one dashboard.',newPlayer:'+ Add player',manage:'Manage',upload:'+ Upload PDF',
    name:'Name',username:'Username',password:'Password',newPassword:'New password',currentPassword:'Current password',enter:'Sign in',loginSub:'Access your private area.',create:'Create account',
    foot:'Nutrition. Performance. Detail.',logout:'Sign out',install:'Install',save:'Save',cancel:'Cancel',file:'PDF file',pdfNote:'PDF up to 20 MB.',empty:'There are no documents in this folder yet.',
    noPlayers:'No players have been added yet.',replace:'Replace',remove:'Delete',removeConfirm:'Delete this document?',inactive:'Inactive',active:'Active',
    deactivate:'Deactivate',reactivate:'Reactivate',statusConfirm:'Change this player’s access?',search:'Find player',administrators:'Administrators',noMatches:'No players found.',
    adminSub:'Accounts with full administration access.',generateLink:'Generate link',current:'You',overview:'Overview',totalPlayers:'Players',activePlayers:'Active',inactivePlayers:'Inactive',totalDocuments:'Documents',
    edit:'Edit details',update:'Save changes',deletePlayer:'Delete player',deletePlayerConfirm:'Delete this player and all their documents? This cannot be undone.',
    playerDetails:'Player details',birthDate:'Date of birth',sex:'Sex',male:'Male',female:'Female',height:'Height (cm)',weight:'Current weight (kg)',photo:'Photo',planName:'Plan',renewalDate:'Renewal date',menus:'Menus',anthropometry:'Anthropometric assessments',
    enabled:'Enabled',disabled:'Disabled',resetPassword:'Change password',changePassword:'Change password',passwordChanged:'Password changed.',profile:'Player profile',
    registerWeight:'Register weight',postGame:'Post-game',formsUnavailable:'Form not configured yet.',forgot:'Forgot password',forgotText:'Contact Filipe Sousa or Raquel Gomes to reset access.',changeAccess:'Change password',backToLogin:'Back to sign in',
    activate:'Set password',activateSub:'Choose a password.',confirm:'Confirm password',
    errors:{credentials:'Incorrect username/email or password.',login_required:'Your session has ended. Sign in again.',csrf:'Refresh this page and try again.',origin:'Request not allowed.',
      password_length:'Use at least 8 characters.',password_change:'Check the current password and use at least 8 characters for the new one.',activation:'This link has expired or has already been used.',
      username_exists:'This username already exists.',photo:'Select a JPG, PNG or WebP photo up to 3 MB.',pdf_only:'Select a valid PDF file.',file_size:'The file exceeds the permitted size.',
      forbidden:'You do not have access to this content.',user_fields:'Check the player details.',rate_limit:'Too many attempts. Try again in 15 minutes.',network:'Unable to connect. Try again.',
      password_mismatch:'Passwords do not match.',generic:'Unable to complete. Try again.'}
  }
};

function t(){ return words[lang]; }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function statusLabel(p,w){ return p.active ? w.active : w.inactive; }
function statusClass(p){ return p.active ? 'active' : 'inactive'; }
function boolChecked(v){ return v ? 'checked' : ''; }

function playerIcon(name){
  const icons={
    nutrition:'<svg class="solid-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8.7L19 7.8v12.7H6z"/><path d="M14.7 3.5v4.3H19z" opacity=".72"/></svg>',
    menus:'<svg class="solid-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.7c3.1-1.1 6-.7 8.5 1.1v12c-2.5-1.8-5.4-2.2-8.5-1.1zM20.5 5.7c-3.1-1.1-6-.7-8.5 1.1v12c2.5-1.8 5.4-2.2 8.5-1.1z"/></svg>',
    other:'<svg class="solid-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 7.2h6.4l1.8 2h10.2v10.1H2.8z"/><path d="M2.8 7.2V5.1h5.4l1.7 2.1z"/></svg>',
    anthropometry:'<svg class="solid-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="14" width="3.5" height="6" rx=".8"/><rect x="10.2" y="9" width="3.5" height="11" rx=".8"/><rect x="16.4" y="4" width="3.5" height="16" rx=".8"/></svg>',
    document:'<svg class="soft-document-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 3.8h6.5c.7 0 1.3.25 1.8.75l2.55 2.55c.5.5.75 1.1.75 1.8v9.5c0 1.05-.85 1.9-1.9 1.9H7.6c-1.05 0-1.9-.85-1.9-1.9V5.7c0-1.05.85-1.9 1.9-1.9z"/><path d="M14.4 4.1v3.7c0 .65.55 1.2 1.2 1.2h3.25"/><path d="M9.1 13h5.8M9.1 16.2h4.4"/></svg>',
    refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 8A7 7 0 1 0 19 14"/><path d="M18.2 4.5V8h-3.5"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H5.5v14H10"/><path d="M13 8l4 4-4 4M8 12h9"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.2" width="16" height="14.8" rx="3.6"/><path d="M8 3.7v3.4M16 3.7v3.4M4.5 9.2h15"/></svg>',
    scale:'<svg class="scale-icon" viewBox="0 0 810 810" aria-hidden="true"><path d="M 603.32 203.09 L 559.21 203.09 C 556.66 200.62 554.05 198.21 551.38 195.87 C 548.71 193.52 546 191.25 543.2 189.03 C 540.43 186.82 537.59 184.67 534.71 182.59 C 531.83 180.51 528.9 178.5 525.92 176.57 C 522.94 174.63 519.92 172.76 516.85 170.97 C 513.78 169.18 510.67 167.46 507.52 165.82 C 504.37 164.18 501.18 162.61 497.96 161.12 C 494.73 159.63 491.47 158.22 488.18 156.88 C 484.88 155.55 481.56 154.3 478.2 153.12 C 474.85 151.95 471.47 150.86 468.06 149.85 C 464.65 148.84 461.23 147.91 457.77 147.07 C 454.32 146.22 450.85 145.46 447.36 144.78 C 443.88 144.1 440.38 143.5 436.86 143 C 433.34 142.48 429.81 142.06 426.28 141.71 C 422.74 141.38 419.2 141.12 415.65 140.95 C 412.1 140.78 408.55 140.69 405 140.69 C 401.44 140.69 397.89 140.78 394.34 140.95 C 390.79 141.12 387.25 141.38 383.71 141.71 C 380.17 142.06 376.64 142.48 373.13 143 C 369.61 143.5 366.11 144.1 362.62 144.78 C 359.13 145.46 355.66 146.22 352.21 147.07 C 348.76 147.91 345.33 148.84 341.92 149.85 C 338.52 150.86 335.14 151.95 331.78 153.12 C 328.43 154.3 325.1 155.55 321.81 156.88 C 318.52 158.22 315.25 159.63 312 161.12 C 308.8 162.61 305.61 164.18 302.46 165.82 C 299.31 167.46 296.2 169.18 293.13 170.97 C 290.07 172.76 287.04 174.63 284.06 176.57 C 281.09 178.5 278.15 180.51 275.27 182.59 C 272.39 184.67 269.56 186.82 266.78 189.03 C 264 191.25 261.28 193.52 258.61 195.87 C 255.94 198.21 253.32 200.62 250.77 203.09 L 206.66 203.09 C 205.42 203.1 204.17 203.13 202.92 203.19 C 201.68 203.25 200.43 203.35 199.19 203.47 C 197.95 203.59 196.71 203.75 195.48 203.93 C 194.24 204.12 193 204.33 191.79 204.58 C 190.57 204.82 189.35 205.09 188.14 205.4 C 186.93 205.7 185.73 206.04 184.53 206.4 C 183.34 206.77 182.15 207.16 181 207.58 C 179.8 208 178.64 208.45 177.49 208.93 C 176.34 209.41 175.2 209.91 174.07 210.45 C 172.94 211 171.82 211.54 170.73 212.13 C 169.62 212.72 168.54 213.34 167.47 214 C 166.4 214.62 165.34 215.29 164.31 216 C 163.27 216.68 162.25 217.39 161.25 218.14 C 160.25 218.88 159.26 219.65 158.3 220.44 C 157.34 221.23 156.39 222.05 155.46 222.88 C 154.54 223.72 153.64 224.58 152.75 225.46 C 151.87 226.35 151 227.25 150.18 228.18 C 149.34 229.1 148.52 230.05 147.73 231 C 146.94 232 146.17 232.96 145.43 233.96 C 144.68 234.96 143.96 236 143.27 237 C 142.58 238.06 141.91 239.11 141.27 240.18 C 140.62 241.25 140 242.34 139.42 243.44 C 138.83 244.54 138.27 245.65 137.74 246.78 C 137.2 247.91 136.7 249.05 136.22 250.2 C 135.74 251.36 135.29 252.52 134.87 253.69 C 134.45 254.87 134.06 256.05 133.7 257.25 C 133.33 258.44 133 259.64 132.7 260.85 C 132.39 262.06 132.12 263.28 131.87 264.5 C 131.62 265.73 131.41 266.96 131.23 268.19 C 131.04 269.43 130.89 270.66 130.77 271.91 C 130.64 273.15 130.55 274.39 130.49 275.64 C 130.43 276.88 130.39 278.13 130.39 279.38 L 130.39 613.61 C 130.39 614.86 130.43 616.1 130.49 617.35 C 130.55 618.6 130.64 619.84 130.77 621.08 C 130.89 622.32 131.04 623.56 131.23 624.8 C 131.41 626.03 131.62 627.26 131.87 628.48 C 132.11 629.71 132.39 630.93 132.69 632.14 C 133 633.35 133.33 634.55 133.69 635.74 C 134.05 636.94 134.45 638.12 134.87 639.3 C 135.29 640.47 135.74 641.64 136.21 642.79 C 136.7 643.94 137.2 645.08 137.73 646.21 C 138.27 647.34 138.83 648.45 139.42 649.55 C 140 650.65 140.62 651.74 141.26 652.81 C 141.91 653.88 142.57 654.93 143.27 656 C 143.96 657 144.68 658 145.42 659.03 C 146.16 660.04 146.93 661 147.73 662 C 148.52 662.95 149.33 663.89 150.17 664.82 C 151 665.74 151.87 666.64 152.75 667.53 C 153.63 668.41 154.54 669.27 155.46 670.11 C 156.39 670.95 157.33 671.76 158.29 672.55 C 159.26 673.35 160.24 674.12 161.25 674.86 C 162.25 675.6 163.27 676.32 164.3 677 C 165.34 677.71 166.39 678.38 167.46 679 C 168.54 679.66 169.62 680.28 170.72 680.87 C 171.82 681.45 172.94 682 174.06 682.55 C 175.19 683.09 176.33 683.59 177.48 684.07 C 178.64 684.55 179.8 685 181 685.42 C 182.15 685.84 183.34 686.23 184.53 686.6 C 185.72 686.96 186.93 687.29 188.14 687.6 C 189.35 687.9 190.56 688.18 191.79 688.42 C 193 688.66 194.24 688.88 195.48 689.07 C 196.71 689.25 197.95 689.4 199.19 689.53 C 200.43 689.65 201.68 689.74 202.92 689.8 C 204.17 689.87 205.41 689.9 206.66 689.9 L 603.32 689.9 C 604.57 689.9 605.82 689.87 607.06 689.8 C 608.31 689.74 609.55 689.65 610.8 689.53 C 612.04 689.4 613.27 689.25 614.51 689.07 C 615.75 688.88 617 688.66 618.2 688.42 C 619.42 688.18 620.64 687.9 621.85 687.6 C 623.06 687.29 624.26 686.96 625.46 686.6 C 626.65 686.23 627.84 685.84 629 685.42 C 630.18 685 631.35 684.55 632.5 684.07 C 633.65 683.59 634.79 683.09 635.92 682.55 C 637.05 682 638.16 681.46 639.27 680.87 C 640.36 680.28 641.45 679.66 642.52 679 C 643.59 678.38 644.64 677.71 645.68 677 C 646.72 676.32 647.74 675.6 648.74 674.86 C 649.75 674.12 650.73 673.35 651.69 672.55 C 652.66 671.77 653.6 670.95 654.53 670.11 C 655.45 669.27 656.36 668.41 657.24 667.53 C 658.12 666.64 659 665.74 659.82 664.82 C 660.66 663.89 661.47 662.95 662.27 662 C 663.05 661 663.82 660.04 664.57 659.03 C 665.31 658.03 666.03 657 666.72 656 C 667.42 654.93 668.09 653.88 668.73 652.81 C 669.37 651.74 670 650.66 670.57 649.55 C 671.16 648.45 671.72 647.34 672.26 646.21 C 672.79 645.08 673.3 643.94 673.77 642.79 C 674.25 641.64 674.7 640.47 675.12 639.3 C 675.55 638.12 675.94 636.94 676.3 635.74 C 676.66 634.55 677 633.35 677.3 632.14 C 677.61 630.93 677.88 629.71 678.12 628.48 C 678.37 627.26 678.58 626.03 678.77 624.8 C 678.95 623.56 679.11 622.32 679.23 621.08 C 679.35 619.84 679.45 618.6 679.51 617.35 C 679.57 616.1 679.6 614.86 679.6 613.61 L 679.6 279.38 C 679.6 278.13 679.57 276.88 679.51 275.64 C 679.45 274.39 679.35 273.14 679.23 271.91 C 679.11 270.66 678.95 269.43 678.77 268.19 C 678.58 266.96 678.37 265.73 678.12 264.5 C 677.88 263.28 677.6 262.06 677.3 260.85 C 677 259.64 676.66 258.44 676.3 257.25 C 675.93 256.05 675.54 254.87 675.12 253.69 C 674.7 252.52 674.25 251.36 673.77 250.2 C 673.29 249.05 672.79 247.91 672.26 246.78 C 671.72 245.65 671.16 244.54 670.57 243.44 C 669.98 242.34 669.37 241.25 668.73 240.18 C 668.08 239.11 667.42 238.06 666.72 237 C 666.03 236 665.31 234.96 664.57 233.96 C 663.82 232.96 663.05 232 662.26 231 C 661.47 230.05 660.65 229.1 659.82 228.18 C 658.98 227.25 658.12 226.35 657.24 225.46 C 656.35 224.58 655.45 223.72 654.52 222.88 C 653.6 222.05 652.65 221.23 651.69 220.44 C 650.73 219.65 649.74 218.88 648.74 218.14 C 647.74 217.39 646.72 216.68 645.69 216 C 644.65 215.29 643.6 214.62 642.53 214 C 641.45 213.34 640.37 212.72 639.27 212.13 C 638.17 211.54 637.05 211 635.92 210.45 C 634.79 209.91 633.65 209.41 632.5 208.93 C 631.35 208.45 630.18 208 629.01 207.58 C 627.83 207.16 626.65 206.77 625.45 206.4 C 624.26 206.04 623.06 205.7 621.85 205.4 C 620.64 205.09 619.42 204.82 618.2 204.58 C 616.97 204.33 615.74 204.12 614.51 203.93 C 613.27 203.75 612.04 203.59 610.8 203.47 C 609.55 203.35 608.31 203.25 607.06 203.19 C 605.82 203.13 604.57 203.1 603.32 203.09 Z M 662.96 613.61 C 662.96 615.57 662.86 617.52 662.67 619.46 C 662.47 621.41 662.18 623.34 661.8 625.25 C 661.42 627.16 660.95 629.05 660.38 630.92 C 659.81 632.79 659.15 634.62 658.4 636.43 C 657.65 638.23 656.82 640 655.9 641.72 C 654.98 643.44 653.98 645.11 652.89 646.74 C 651.8 648.36 650.64 649.92 649.4 651.43 C 648.16 652.94 646.85 654.38 645.47 655.76 C 644.09 657.14 642.64 658.45 641.14 659.69 C 639.63 660.93 638.06 662.09 636.44 663.18 C 634.82 664.27 633.14 665.27 631.42 666.19 C 629.7 667.11 627.94 667.95 626.13 668.7 C 624.33 669.45 622.49 670.11 620.62 670.67 C 618.76 671.24 616.86 671.71 614.95 672.09 C 613.04 672.48 611.11 672.76 609.16 672.96 C 607.22 673.15 605.27 673.25 603.32 673.25 L 206.66 673.25 C 204.7 673.25 202.76 673.15 200.81 672.96 C 198.87 672.76 196.94 672.48 195.03 672.09 C 193.11 671.71 191.22 671.24 189.35 670.67 C 187.49 670.11 185.65 669.45 183.84 668.7 C 182.04 667.95 180.28 667.11 178.56 666.19 C 176.84 665.27 175.16 664.27 173.54 663.18 C 171.92 662.09 170.35 660.93 168.85 659.69 C 167.34 658.45 165.89 657.14 164.51 655.76 C 163.13 654.38 161.82 652.94 160.58 651.43 C 159.34 649.92 158.18 648.36 157.09 646.74 C 156 645.11 155 643.44 154.08 641.72 C 153.16 640 152.33 638.23 151.58 636.43 C 150.83 634.62 150.17 632.79 149.6 630.92 C 149.03 629.05 148.56 627.16 148.18 625.25 C 147.8 623.34 147.51 621.41 147.32 619.46 C 147.12 617.52 147.03 615.57 147.02 613.61 L 147.02 279.38 C 147.03 277.43 147.12 275.48 147.32 273.54 C 147.51 271.59 147.8 269.66 148.18 267.75 C 148.56 265.83 149.03 263.94 149.6 262.07 C 150.17 260.21 150.83 258.37 151.58 256.57 C 152.33 254.76 153.16 253 154.08 251.28 C 155 249.55 156 247.88 157.09 246.26 C 158.18 244.64 159.34 243.07 160.58 241.56 C 161.82 240.05 163.13 238.61 164.51 237.23 C 165.89 235.85 167.34 234.54 168.85 233.3 C 170.35 232.06 171.92 230.9 173.54 229.81 C 175.16 228.73 176.84 227.72 178.56 226.8 C 180.28 225.88 182.04 225.05 183.84 224.3 C 185.65 223.55 187.49 222.89 189.35 222.32 C 191.22 221.76 193.11 221.28 195.03 220.9 C 196.94 220.52 198.87 220.23 200.81 220.04 C 202.76 219.84 204.7 219.75 206.66 219.74 L 254.17 219.74 C 255.27 219.74 256.33 219.53 257.35 219.11 C 258.37 218.69 259.27 218.09 260.05 217.32 C 262.43 214.95 264.86 212.64 267.34 210.39 C 269.83 208.13 272.37 205.95 274.96 203.82 C 277.55 201.69 280.2 199.63 282.89 197.63 C 285.59 195.64 288.33 193.71 291.12 191.85 C 293.91 190 296.75 188.19 299.62 186.47 C 302.5 184.75 305.42 183.09 308.38 181.51 C 311.34 179.93 314.33 178.43 317.37 177 C 320.4 175.56 323.46 174.2 326.56 172.92 C 329.66 171.64 332.79 170.43 335.95 169.3 C 339.11 168.17 342.29 167.12 345.5 166.15 C 348.71 165.18 351.95 164.28 355.2 163.47 C 358.45 162.65 361.72 161.92 365 161.27 C 368.3 160.61 371.61 160.04 374.93 159.55 C 378.24 159.05 381.57 158.64 384.91 158.32 C 388.25 158 391.59 157.74 394.94 157.58 C 398.29 157.41 401.64 157.33 405 157.33 C 408.35 157.33 411.7 157.41 415.05 157.58 C 418.41 157.74 421.75 158 425.09 158.32 C 428.43 158.64 431.75 159.05 435.07 159.55 C 438.39 160.04 441.69 160.61 445 161.27 C 448.27 161.92 451.54 162.65 454.8 163.47 C 458.05 164.28 461.29 165.18 464.49 166.15 C 467.7 167.12 470.89 168.17 474.05 169.3 C 477.2 170.43 480.33 171.64 483.43 172.92 C 486.53 174.2 489.6 175.56 492.63 177 C 495.66 178.43 498.66 179.93 501.62 181.51 C 504.57 183.09 507.49 184.75 510.37 186.47 C 513.25 188.19 516.08 190 518.87 191.85 C 521.66 193.71 524.41 195.64 527.1 197.63 C 529.8 199.63 532.44 201.69 535.04 203.82 C 537.63 205.95 540.17 208.13 542.65 210.39 C 545.14 212.64 547.57 214.95 549.95 217.32 C 550.72 218.09 551.62 218.69 552.64 219.11 C 553.66 219.53 554.71 219.74 555.81 219.74 L 603.32 219.74 C 605.27 219.75 607.22 219.84 609.16 220.04 C 611.11 220.23 613.04 220.52 614.95 220.9 C 616.86 221.28 618.76 221.76 620.62 222.32 C 622.49 222.89 624.33 223.55 626.13 224.3 C 627.94 225.05 629.7 225.88 631.42 226.8 C 633.14 227.72 634.82 228.73 636.44 229.81 C 638.06 230.9 639.63 232.06 641.14 233.3 C 642.64 234.54 644.09 235.85 645.47 237.23 C 646.85 238.61 648.16 240.05 649.4 241.56 C 650.64 243.07 651.8 244.64 652.89 246.26 C 654 247.88 655 249.55 655.9 251.28 C 656.82 253 657.65 254.76 658.4 256.57 C 659.15 258.37 659.81 260.21 660.38 262.07 C 660.94 263.94 661.42 265.83 661.8 267.75 C 662.18 269.66 662.47 271.59 662.66 273.54 C 662.86 275.48 662.95 277.43 662.96 279.38 Z M 662.96 613.61" fill="currentColor"/><path d="M 405 192.84 C 401.4 192.84 397.8 192.95 394.21 193.17 C 390.62 193.39 387.04 193.72 383.46 194.16 C 379.89 194.6 376.34 195.15 372.8 195.81 C 369.26 196.47 365.75 197.24 362.26 198.12 C 358.77 199 355.31 200 351.88 201.07 C 348.45 202.16 345.06 203.35 341.7 204.65 C 338.34 205.95 335.03 207.36 331.76 208.86 C 328.49 210.36 325.27 211.96 322.1 213.67 C 318.93 215.37 315.82 217.17 312.76 219.07 C 309.7 220.96 306.7 222.95 303.77 225 C 300.83 227.11 297.96 229.28 295.15 231.54 C 292.35 233.79 289.62 236.13 286.96 238.56 C 284.3 241 281.72 243.49 279.22 246.07 C 276.71 248.66 274.29 251.32 271.95 254.05 C 269.61 256.79 267.36 259.59 265.19 262.46 C 263 265.34 260.95 268.28 258.96 271.28 C 258.57 271.87 258.26 272.5 258.03 273.17 C 257.8 273.84 257.66 274.54 257.61 275.24 C 257.55 275.95 257.59 276.65 257.71 277.35 C 257.84 278.05 258.05 278.72 258.35 279.37 L 299.95 369.53 C 300.28 370.25 300.71 370.91 301.23 371.51 C 301.76 372.11 302.35 372.62 303 373.05 C 303.7 373.48 304.41 373.81 305.18 374.04 C 305.94 374.26 306.72 374.37 307.51 374.37 L 502.48 374.37 C 503.28 374.37 504.06 374.26 504.82 374.03 C 505.59 373.81 506.3 373.48 507 373.05 C 507.64 372.62 508.24 372.11 508.76 371.51 C 509.29 370.91 509.71 370.25 510.05 369.53 L 551.65 279.34 C 551.95 278.7 552.16 278 552.29 277.33 C 552.41 276.63 552.45 275.93 552.39 275.22 C 552.33 274.51 552.19 273.82 551.96 273.15 C 551.73 272.48 551.41 271.85 551 271.25 C 549.04 268.25 546.96 265.32 544.79 262.44 C 542.62 259.57 540.37 256.77 538.03 254.03 C 535.69 251.3 533.27 248.64 530.77 246.05 C 528.27 243.47 525.68 240.96 523 238.54 C 520.37 236.11 517.64 233.77 514.83 231.52 C 512.03 229.26 509.16 227.09 506.22 225 C 503.29 222.93 500.29 220.95 497.23 219.05 C 494.17 217.16 491.06 215.36 487.89 213.66 C 484.71 211.95 481.5 210.35 478.23 208.84 C 474.96 207.34 471.64 205.94 468.29 204.64 C 464.93 203.34 461.54 202.15 458.11 201.06 C 454.68 199.97 451.22 199 447.73 198.11 C 444.24 197.23 440.73 196.46 437.19 195.8 C 433.65 195.14 430.1 194.6 426.53 194.16 C 422.96 193.71 419.38 193.39 415.78 193.17 C 412.19 192.95 408.6 192.84 405 192.84 Z M 438.56 357.75 L 371.45 357.75 C 371.68 356.81 371.95 355.89 372.25 355 C 372.55 354.08 372.89 353.18 373.27 352.3 C 373.65 351.42 374.07 350.56 374.52 349.71 C 374.97 348.87 375.45 348.04 376 347.23 C 376.49 346.43 377.04 345.65 377.63 344.89 C 378.21 344.13 378.83 343.39 379.47 342.69 C 380.12 342 380.79 341.3 381.49 340.64 C 382.2 340 382.92 339.37 383.68 338.78 C 384.43 338.19 385.21 337.63 386 337.1 C 386.81 336.57 387.63 336.08 388.47 335.62 C 389.31 335.16 390.17 334.74 391.05 334.36 C 391.93 333.97 392.82 333.62 393.72 333.3 C 394.63 333 395.54 332.72 396.47 332.48 C 397.4 332.24 398.34 332.05 399.29 331.89 C 400.23 331.73 401.18 331.61 402.13 331.53 C 403.09 331.45 404.05 331.41 405 331.41 C 405.96 331.41 406.92 331.45 407.88 331.53 C 408.83 331.61 409.78 331.73 410.72 331.89 C 411.67 332.05 412.61 332.24 413.54 332.48 C 414.46 332.72 415.38 333 416.29 333.3 C 417.19 333.62 418.08 333.97 418.96 334.36 C 419.84 334.74 420.7 335.16 421.54 335.62 C 422.38 336.08 423.2 336.57 424 337.1 C 424.8 337.63 425.57 338.19 426.33 338.78 C 427.08 339.37 427.81 340 428.52 340.64 C 429.21 341.3 429.89 342 430.54 342.69 C 431.18 343.39 431.8 344.13 432.38 344.89 C 432.96 345.65 433.52 346.43 434.04 347.23 C 434.55 348.04 435.04 348.87 435.49 349.71 C 435.94 350.56 436.36 351.42 436.73 352.3 C 437.11 353.18 437.45 354.08 437.76 355 C 438.06 355.89 438.33 356.81 438.56 357.75 Z M 497.16 357.75 L 455.58 357.75 C 455.25 355.74 454.79 353.76 454.23 351.8 C 453.66 349.85 453 347.94 452.18 346.07 C 451.38 344.19 450.47 342.38 449.46 340.61 C 448.45 338.84 447.34 337.14 446.12 335.51 C 444.91 333.88 443.6 332.32 442.2 330.84 C 440.8 329.37 439.32 328 437.76 326.67 C 436.2 325.37 434.56 324.16 432.86 323.05 C 431.15 321.95 429.39 320.94 427.56 320.04 L 442.34 273.42 C 442.49 272.9 442.58 272.38 442.62 271.84 C 442.67 271.31 442.66 270.78 442.6 270.25 C 442.54 269.72 442.43 269.2 442.27 268.69 C 442.11 268.18 441.9 267.68 441.65 267.21 C 441.39 266.75 441.1 266.3 440.76 265.89 C 440.42 265.48 440.04 265.1 439.63 264.76 C 439.22 264.42 438.78 264.12 438.31 263.86 C 437.84 263.61 437.35 263.4 436.84 263.24 C 436.33 263.07 435.81 262.96 435.28 262.9 C 434.75 262.84 434.21 262.83 433.68 262.87 C 433.15 262.91 432.62 263 432.11 263.14 C 431.59 263.29 431.1 263.48 430.62 263.71 C 430.14 263.95 429.69 264.23 429.26 264.56 C 428.84 264.88 428.45 265.25 428.09 265.65 C 427.74 266.05 427.42 266.48 427.15 266.94 C 426.88 267.4 426.65 267.88 426.47 268.38 L 411.6 315.29 C 409.41 314.97 407.21 314.79 405 314.75 C 403.49 314.75 402 314.82 400.49 314.95 C 399 315.09 397.5 315.29 396 315.55 C 394.54 315.82 393.07 316.15 391.62 316.54 C 390.17 316.94 388.74 317.39 387.33 317.91 C 385.91 318.43 384.53 319 383.17 319.66 C 381.81 320.3 380.48 321 379.18 321.76 C 377.88 322.52 376.62 323.33 375.39 324.2 C 374.16 325.07 373 326 371.83 327 C 370.68 327.95 369.58 328.97 368.52 330.04 C 367.46 331.11 366.46 332.23 365.5 333.39 C 364.54 334.55 363.64 335.75 362.79 337 C 361.93 338.23 361.13 339.5 360.39 340.81 C 359.65 342.12 359 343.46 358.35 344.83 C 357.73 346.2 357.16 347.6 356.66 349 C 356.16 350.43 355.73 351.88 355.35 353.33 C 355 354.79 354.67 356.26 354.43 357.75 L 312.83 357.75 L 275.43 276.69 C 280.95 268.87 287.12 261.61 293.96 254.91 C 300.79 248.21 308.17 242.17 316.09 236.8 L 326.64 254.78 C 327 255.4 327.46 255.97 328 256.48 C 328.49 257 329.07 257.42 329.7 257.78 C 330.33 258.14 331 258.41 331.7 258.6 C 332.4 258.79 333.11 258.88 333.84 258.88 C 334.58 258.88 335.3 258.78 336 258.59 C 336.72 258.4 337.39 258.12 338.03 257.75 C 338.67 257.38 339.25 256.93 339.76 256.41 C 340.28 255.89 340.72 255.3 341.09 254.66 C 341.45 254 341.72 253.35 341.91 252.64 C 342.09 251.93 342.18 251.2 342.17 250.46 C 342.16 249.73 342.06 249 341.86 248.3 C 341.66 247.59 341.37 246.92 341 246.29 L 330.35 228.19 C 340.6 222.71 351.32 218.41 362.51 215.29 C 373.71 212.18 385.11 210.33 396.71 209.73 L 396.71 230.14 C 396.69 230.7 396.73 231.26 396.82 231.81 C 396.91 232.36 397.06 232.9 397.26 233.43 C 397.46 233.95 397.71 234.45 398 234.92 C 398.31 235.39 398.65 235.83 399.04 236.23 C 399.43 236.64 399.85 237 400.31 237.31 C 400.78 237.63 401.27 237.9 401.78 238.12 C 402.29 238.34 402.83 238.5 403.38 238.61 C 403.92 238.73 404.48 238.78 405.04 238.78 C 405.6 238.78 406.15 238.73 406.7 238.61 C 407.25 238.5 407.78 238.34 408.3 238.12 C 408.81 237.9 409.3 237.63 409.76 237.31 C 410.22 237 410.65 236.64 411.04 236.23 C 411.43 235.83 411.77 235.39 412.07 234.92 C 412.37 234.45 412.62 233.95 412.82 233.43 C 413 232.9 413.16 232.36 413.26 231.81 C 413.35 231.26 413.38 230.7 413.36 230.14 L 413.36 209.73 C 424.97 210.32 436.37 212.18 447.56 215.29 C 458.76 218.41 469.48 222.7 479.73 228.19 L 469.08 246.29 C 468.83 246.76 468.62 247.25 468.46 247.76 C 468.3 248.27 468.19 248.79 468.13 249.32 C 468.07 249.85 468.07 250.38 468.11 250.91 C 468.15 251.45 468.24 252 468.39 252.48 C 468.53 253 468.72 253.5 468.96 254 C 469.2 254.45 469.48 254.9 469.8 255.33 C 470.13 255.75 470.5 256.14 470.89 256.49 C 471.3 256.85 471.73 257.16 472.19 257.43 C 472.64 257.7 473.13 257.93 473.63 258.11 C 474.14 258.28 474.65 258.41 475.18 258.49 C 475.71 258.57 476.24 258.6 476.77 258.57 C 477.31 258.55 477.83 258.48 478.35 258.35 C 478.87 258.23 479.38 258.05 479.86 257.83 C 480.35 257.61 480.81 257.34 481.24 257.04 C 481.68 256.73 482.08 256.38 482.45 256 C 482.82 255.6 483.14 255.18 483.43 254.73 L 493.9 236.8 C 501.83 242.18 509.21 248.22 516.04 254.93 C 522.87 261.64 529.05 268.91 534.57 276.73 Z M 497.16 357.75" fill="currentColor"/></svg>',
    ball:'<svg class="ball-icon" viewBox="0 0 810 810" aria-hidden="true"><path d="M 160.67 404.4 C 161.03 270.91 271.35 161.55 405.08 162.11 C 538.9 162.68 649.19 273 647.08 408.04 C 645 541.71 540.09 648.05 404.48 648.31 C 265.87 648.58 161.48 538.14 160.67 404.4 Z M 514.84 485.09 C 514 453.28 501.59 423.26 484.85 394.67 C 482.7 391 479.65 389 475.33 388.27 C 446.21 383.49 417.07 378.71 388 373.53 C 380.91 372.27 375.86 374.32 370.86 379.14 C 349.87 399.4 329.55 420.24 311.32 443.09 C 306.22 449.49 305.27 455.23 308.18 462.84 C 317.18 486.31 325.76 509.95 334.19 533.64 C 336.2 539.3 339.23 543.13 344.83 545.59 C 374.46 558.62 405.86 563.81 437.72 567.04 C 441.84 567.46 445.62 566.73 448.79 563.7 C 470.16 543.31 491.57 522.95 510.48 500.16 C 513.68 496.32 515.62 492.11 514.84 485.09 Z M 287.61 254.12 C 274.77 252 261.58 260.07 250.27 272.54 C 235.23 289.13 222 307.18 208.8 325.22 C 206.62 328.2 204.81 331.3 205.12 335.08 C 207.51 363.68 208.31 392.51 217.96 420 C 219.75 425.11 222.12 429.14 228.12 430.57 C 249.46 435.69 270.72 441.17 292 446.57 C 297.53 448 302 447.08 305.78 442.3 C 324.92 418.18 345.24 395.14 368.57 374.94 C 373.37 370.79 374.75 366.1 373.08 360 C 366.2 334.86 363.29 309.08 361.77 283.16 C 361.24 274 357.21 268.6 348.57 265.5 C 330.39 258.96 311.79 255.09 287.61 254.12 Z M 550.11 305.06 C 536.91 304.05 528.75 310.96 522.73 325.88 C 515.13 344.75 504.69 362.4 492.57 378.82 C 488.14 384.82 487.75 389.65 491.46 396.14 C 506.62 422.73 517.89 450.77 519.95 481.71 C 520.52 490.29 524.57 493.16 532.86 493.54 C 549.18 494.26 565.46 495.75 581.73 497.32 C 588 497.93 592.41 495.77 596.4 491.24 C 615.59 469.51 627.7 444.21 634.39 416.2 C 635.12 413.16 635.3 409.77 634.81 406.7 C 631.34 385 626 363.84 617.5 343.39 C 607.07 318.41 587.63 306.39 562.09 305.06 C 559.25 304.91 556 305.06 550.11 305.06 Z M 405.59 167.74 C 363.08 168 326.34 177.13 291.89 195.37 C 288.75 197 283.16 199.23 283.23 201 C 283.84 215.5 274.7 227.79 274.7 242.08 C 274.69 248.55 277 250.39 283.2 250 C 307.45 248.46 330.78 252.83 353.17 262.14 C 358.56 264.38 363.32 265.72 368.86 262 C 386.53 250.07 406.42 242.95 426.42 236.06 C 458.32 225.08 458.28 224.96 455.34 191.26 C 455.3 190.87 455.29 190.47 455.27 190.07 C 454.96 182.48 451.15 177.57 444.18 174.58 C 430.68 168.78 416.5 167.54 405.59 167.74 Z M 397.79 643.82 C 422.45 640.29 447.36 635.36 470.48 623.73 C 476.05 620.92 477.4 617.73 472.54 612.82 C 463.48 603.71 456.72 592.83 450 582 C 446.35 576.13 441.83 573.2 434.74 572.3 C 402.68 568.27 370.87 562.94 341.08 549.46 C 337.13 547.67 333.47 548 329.88 550.7 C 315.84 561.27 301.12 570.78 285.14 578.2 C 280.69 580.27 278.8 583.18 282.19 587.49 C 296.3 605.4 310.87 623.28 332.59 632.08 C 353.06 640.37 375.29 641.23 397.79 643.82 Z M 605.79 316.4 C 607.47 297.21 605.46 279.61 596.06 265.75 C 574 233.22 544 208.85 508.48 191.72 C 496.21 185.8 483.4 181.35 469.45 181.89 C 465.62 182.04 460.64 181.48 460.85 187.48 C 461.26 199.83 461.76 212.16 460.55 224.5 C 460.29 227.15 462.58 228.69 464.55 230.07 C 488.43 246.77 506.53 269 523.49 292.25 C 528.26 298.78 533.85 301.14 541.73 301 C 563.75 300.63 585.55 301.9 605.79 316.4 Z M 166.32 406.25 C 166.1 430.78 170.05 454.64 177.43 478 C 179.44 484.38 182.91 489.35 188.59 492.93 C 198.07 498.91 200.7 498.1 202.86 487.18 C 206.18 470.36 209.21 453.49 215.19 437.35 C 216.68 433.32 216.07 429.71 214.65 425.8 C 208.37 408.48 204.64 390.61 203.2 372.21 C 202.3 360.71 200.78 349.25 199.46 337.79 C 198.41 328.66 190.47 326.54 183.95 325.23 C 177.64 324 177.77 331.42 176.5 335.55 C 169.43 358.55 166.23 382.18 166.32 406.25 Z M 303.63 620.55 C 281.11 594.5 259.7 567.47 234.18 544.15 C 223.56 534.45 214.41 523.27 206.41 511.33 C 201.79 504.44 195.59 501.48 185.63 499.83 C 210.78 555.8 249.96 595.18 303.63 620.55 Z M 575.52 568.45 C 615.18 528.81 644.66 459.77 639.42 419.32 C 630.67 449.09 618.09 475.93 596.96 498.1 C 595 500.17 593.59 502.51 593.39 505.45 C 591.89 527.68 584.48 548.19 575.52 568.45 Z M 552.9 589.41 C 523 607.77 488.36 617.04 458.67 636.14 C 493.83 628.32 525.39 613.14 552.9 589.41 Z M 552.9 589.41" fill="currentColor"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.9 17h12.2c-1.1-1.3-1.7-2.8-1.7-4.5V9.9a4.4 4.4 0 0 0-8.8 0v2.6c0 1.7-.6 3.2-1.7 4.5z"/><path d="M9.8 19c.5.9 1.25 1.4 2.2 1.4s1.7-.5 2.2-1.4"/></svg>'
  };
  return icons[name]||'';
}
function formatRenewal(value){
  if(!value)return '';
  const p=String(value).split('-');
  return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : value;
}
function playerFolderIcon(folder){
  return playerIcon(folder);
}
function planExpired(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
  const [y,m,d]=String(value).split('-').map(Number),now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return new Date(y,m-1,d)<today;
}

async function api(path,{method='GET',body=null,binary=false}={}){
  const options={method,credentials:'same-origin',headers:{}};
  if(method!=='GET'&&csrf) options.headers['X-CSRF-Token']=csrf;
  if(body!==null){ options.body=binary?body:JSON.stringify(body); options.headers['Content-Type']=binary?'application/pdf':'application/json'; }
  let r; try{ r=await fetch('/api'+path,options); }catch{ throw Error('network'); }
  let data={}; try{ data=await r.json(); }catch{}
  if(!r.ok){ if(r.status===401&&user){user=null;selected=null;folder=null;mode='';render();} throw Error(data.error||'generic'); }
  return data;
}

function notify(title,text){ const n=document.getElementById('notice'); const nt=document.getElementById('notice-title'); nt.textContent=title; nt.hidden=!!user&&user.role==='player'; document.getElementById('notice-text').textContent=text; document.getElementById('notice-link').hidden=true; document.getElementById('copy-link').hidden=true; n.showModal(); }
function error(e){ const el=ui.root.querySelector('.error'); const msg=t().errors[e.message]||t().errors.generic; if(el)el.textContent=msg; else notify('The Mile',msg); }
function bind(id,fn){ const el=document.getElementById(id); if(el)el.onclick=()=>Promise.resolve().then(fn).catch(error); }
function enablePlayerSwipeBack(backFn,{interactive=true}={}){
  const shell=ui.root.querySelector('.player-shell');
  if(!shell)return;

  let startX=0,startY=0,lastX=0,dragging=false,tracking=false;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  document.body.ontouchstart=e=>{
    if(!e.touches||!e.touches[0])return;
    const t=e.touches[0];
    startX=lastX=t.clientX;
    startY=t.clientY;
    tracking=true;
    dragging=false;
    shell.classList.remove('swipe-back-commit','swipe-back-cancel');
    shell.style.transition='none';
  };

  document.body.ontouchmove=e=>{
    if(!tracking||!e.touches||!e.touches[0])return;
    const t=e.touches[0];
    const dx=t.clientX-startX;
    const dy=Math.abs(t.clientY-startY);

    if(!dragging){
      if(dx<=8)return;
      if(dx<dy*1.15){tracking=false;return;}
      dragging=true;
      if(interactive) shell.classList.add('swipe-back-active');
    }

    if(dx<0)return;
    lastX=t.clientX;

    if(interactive){
      const width=Math.max(window.innerWidth,1);
      const x=clamp(dx,0,width);
      const progress=clamp(x/width,0,1);
      shell.style.transform=`translate3d(${x}px,0,0)`;
      shell.style.opacity=String(1-progress*.08);
      document.documentElement.style.setProperty('--swipe-progress',String(progress));
      if(e.cancelable)e.preventDefault();
    }
  };

  const finishSwipe=e=>{
    if(!tracking&&!dragging)return;
    const end=e.changedTouches&&e.changedTouches[0]?e.changedTouches[0]:null;
    const dx=end?end.clientX-startX:lastX-startX;
    const dy=end?Math.abs(end.clientY-startY):0;
    const width=Math.max(window.innerWidth,1);
    const shouldCommit=dragging && dx>Math.max(72,width*.24) && dx>dy*1.15;

    tracking=false;
    if(!interactive){
      if(shouldCommit) backFn();
      dragging=false;
      return;
    }

    shell.style.transition='transform .22s cubic-bezier(.22,.61,.36,1), opacity .22s ease';

    if(shouldCommit){
      shell.classList.add('swipe-back-commit');
      shell.style.transform=`translate3d(${width}px,0,0)`;
      shell.style.opacity='0.94';
      setTimeout(()=>{
        document.documentElement.style.removeProperty('--swipe-progress');
        backFn();
      },210);
    }else{
      shell.classList.add('swipe-back-cancel');
      shell.style.transform='translate3d(0,0,0)';
      shell.style.opacity='1';
      document.documentElement.style.setProperty('--swipe-progress','0');
      setTimeout(()=>{
        shell.classList.remove('swipe-back-active','swipe-back-cancel');
        shell.style.transition='';
        shell.style.transform='';
        shell.style.opacity='';
        document.documentElement.style.removeProperty('--swipe-progress');
      },230);
    }

    dragging=false;
  };

  document.body.ontouchend=finishSwipe;
  document.body.ontouchcancel=()=>{
    if(!tracking&&!dragging)return;
    tracking=false;
    dragging=false;
    shell.style.transition='transform .18s ease, opacity .18s ease';
    shell.style.transform='translate3d(0,0,0)';
    shell.style.opacity='1';
    document.documentElement.style.setProperty('--swipe-progress','0');
    setTimeout(()=>{
      shell.classList.remove('swipe-back-active','swipe-back-cancel','swipe-back-commit');
      shell.style.transition='';
      shell.style.transform='';
      shell.style.opacity='';
      document.documentElement.style.removeProperty('--swipe-progress');
    },190);
  };
}
function submit(fn){ const form=ui.root.querySelector('form'); if(!form)return; form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button[type="submit"]');if(b)b.disabled=true;const er=form.querySelector('.error');if(er)er.textContent='';try{await fn(new FormData(form));}catch(x){error(x);}finally{if(b)b.disabled=false;}}; }

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{ if(!file||!file.size){resolve('');return;} if(file.size>3*1024*1024){reject(Error('photo'));return;} const rd=new FileReader(); rd.onload=()=>resolve(rd.result); rd.onerror=()=>reject(Error('photo')); rd.readAsDataURL(file); });
}

async function refresh(){
  const session=await api('/me'); user=session.user; csrf=session.csrf;
  if(user){ if(user.role==='admin'){const [p,a]=await Promise.all([api('/players'),api('/admins')]);players=p.players;admins=a.admins;} else docs=(await api('/documents')).documents; }
  render();
}
async function openPlayer(id){ selected=players.find(p=>p.id===id); docs=(await api('/documents?player='+encodeURIComponent(id))).documents; folder=null;mode='';render(); }

function playerForm(w,p=null){
  return `<form class="inline-form">
    <label>${w.name}</label><input name="name" maxlength="120" value="${esc(p?.name||'')}" required>
    <label>${w.username}</label><input name="username" pattern="[a-z]+" autocomplete="off" value="${esc(p?.username||'')}" required>
    <label>${p?w.newPassword:w.password}</label><input name="password" type="password" minlength="8" maxlength="256" ${p?'':'required'}>
    <label>${w.photo}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" ${p?'':'required'}>
    <label>${w.birthDate}</label><input name="birth_date" type="date" value="${esc(p?.birth_date||'')}" required>
    <label>${w.sex}</label><select name="sex" required><option value="M" ${p?.sex==='M'?'selected':''}>${w.male}</option><option value="F" ${p?.sex==='F'?'selected':''}>${w.female}</option></select>
    <label>${w.height}</label><input name="height" type="number" min="50" max="250" step="0.1" value="${esc(p?.height??'')}" required>
    <label>${w.weight}</label><input name="weight" type="number" min="20" max="300" step="0.1" value="${esc(p?.weight??'')}" required>
    <label>${w.planName}</label><input name="plan_name" maxlength="80" value="${esc(p?.plan_name||'')}" required>
    <label>${w.renewalDate}</label><input name="renewal_date" type="date" value="${esc(p?.renewal_date||'')}" required>
    <label><input name="menus_enabled" type="checkbox" style="width:auto" ${boolChecked(p?.menus_enabled)}> ${w.menus}</label>
    <label><input name="anthropometry_enabled" type="checkbox" style="width:auto" ${boolChecked(p?.anthropometry_enabled)}> ${w.anthropometry}</label>
    <p class="error" role="alert"></p><div class="actions"><button class="primary" type="submit">${p?w.update:w.create}</button><button class="secondary" type="button" id="cancel">${w.cancel}</button></div>
  </form>`;
}
async function payloadFromForm(f){
  return {name:f.get('name'),username:String(f.get('username')||'').toLowerCase(),password:f.get('password')||'',photo:await fileToDataURL(f.get('photo')),
    birth_date:f.get('birth_date'),sex:f.get('sex'),height:Number(f.get('height')),weight:Number(f.get('weight')),plan_name:f.get('plan_name'),renewal_date:f.get('renewal_date'),
    menus_enabled:f.get('menus_enabled')==='on',anthropometry_enabled:f.get('anthropometry_enabled')==='on'};
}

function renderDashboard(w){
  if(mode==='create'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><p class="eyebrow">${w.management}</p><h1>${w.newPlayer.slice(2)}</h1>${playerForm(w)}`;
    bind('back',()=>{mode='';render();}); bind('cancel',()=>{mode='';render();});
    submit(async f=>{await api('/players',{method:'POST',body:await payloadFromForm(f)});mode='';await refresh();});
    return;
  }
  const active=players.filter(p=>p.active).length,inactive=players.length-active,totalDocs=players.reduce((n,p)=>n+Number(p.documents||0),0);
  ui.root.innerHTML=`<p class="eyebrow">${w.management} · ${esc(user.name)}</p>
    <div class="topline"><div><h1>${w.players}</h1><p class="subtitle compact">${w.manageSub}</p></div><button class="primary" id="create">${w.newPlayer}</button></div>
    <section class="overview"><div class="metric"><strong>${players.length}</strong><span>${w.totalPlayers}</span></div><div class="metric"><strong>${active}</strong><span>${w.activePlayers}</span></div><div class="metric"><strong>${inactive}</strong><span>${w.inactivePlayers}</span></div><div class="metric"><strong>${totalDocs}</strong><span>${w.totalDocuments}</span></div></section>
    <section class="panel-section"><h2>${w.players}</h2>${players.length?`<label>${w.search}</label><input id="search" type="search"><div id="player-list"></div>`:`<p class="empty">${w.noPlayers}</p>`}</section>
    <section class="panel-section administrators"><h2>${w.administrators}</h2><div>${admins.map(a=>`<div class="row"><div><strong>${esc(a.name)}</strong><p>${esc(a.email)}</p></div></div>`).join('')}</div></section>`;
  bind('create',()=>{mode='create';render();});
  if(players.length){
    const list=document.getElementById('player-list');
    const show=(q='')=>{const f=players.filter(p=>(p.name+' '+p.username).toLowerCase().includes(q.toLowerCase()));list.innerHTML=f.map(p=>`<div class="row player-row"><div><strong>${esc(p.name)}</strong><p>@${esc(p.username)}</p><div class="row-meta"><span class="badge ${statusClass(p)}">${statusLabel(p,w)}</span><span>${p.documents} ${w.documents}</span></div></div><button class="secondary" data-player="${p.id}">${w.manage}</button></div>`).join('')||`<p class="empty">${w.noMatches}</p>`;list.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>openPlayer(b.dataset.player).catch(error));};
    show();document.getElementById('search').oninput=e=>show(e.target.value);
  }
}

function availableFolders(owner){
  const f=['weekly','nutrition','other']; if(owner.menus_enabled)f.splice(2,0,'menus'); if(owner.anthropometry_enabled)f.push('anthropometry'); return f;
}

function renderPlayer(w){
  const isAdmin=user.role==='admin',owner=isAdmin?selected:user;

  if(!isAdmin){
    if(mode==='password'){
      ui.root.innerHTML=`<section class="player-shell player-password"><h1>${w.changePassword}</h1><form class="player-password-form"><label>${w.currentPassword}</label><input name="current_password" type="password" required><label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" required><p class="error"></p><button class="player-solid" type="submit">${w.save}</button></form></section>`;
      enablePlayerSwipeBack(()=>{mode='';render();});
      submit(async f=>{await api('/password',{method:'POST',body:{current_password:f.get('current_password'),new_password:f.get('new_password')}});mode='';notify('The Mile',w.passwordChanged);render();});
      return;
    }

    if(folder!==null){
      const items=docs.filter(d=>d.folder===folder);
      ui.root.innerHTML=`<section class="player-shell player-folder-screen"><h1 class="player-folder-title">${esc(w.folders[folder])}</h1><div class="player-doc-list">${items.length?items.map(d=>`<a class="player-doc-row" href="/api/documents/${d.id}" target="_blank" rel="noopener"><span class="player-row-icon">${playerIcon('document')}</span><span class="player-row-copy"><strong>${esc(d.title)}</strong></span><span class="player-chevron">${playerIcon('chevron')}</span></a>`).join(''):`<p class="player-empty">${w.empty}</p>`}</div></section>`;
      enablePlayerSwipeBack(()=>{folder=null;render();},{interactive:false});
      return;
    }

    const af=availableFolders(owner);
    const expired=planExpired(owner.renewal_date);
    const weekly=docs.find(d=>d.id===owner.current_weekly_document_id&&d.folder==='weekly')||null;
    const planStatus=expired?(lang==='pt'?'Plano expirado':'Plan expired'):`${lang==='pt'?'Plano ':'Plan '}${esc(owner.plan_name||'')}`;
    const renewalText=expired?(lang==='pt'?'Expirou a ':'Expired on '):(lang==='pt'?'Renova a ':'Renews on ');
    const folderName=f=>w.folders[f];

    ui.root.innerHTML=`<section class="player-shell player-home-v4">
      <section class="player-profile-card">
        ${owner.has_photo?`<img class="player-profile-card-avatar" src="/api/players/${owner.id}/photo" alt="">`:''}
        <div class="player-profile-card-copy">
          <h1>${esc(owner.name)}</h1>
          <strong class="player-plan-state ${expired?'expired':''}">${planStatus}</strong>
          <small>${renewalText}${esc(formatRenewal(owner.renewal_date))}</small>
        </div>
      </section>

      <nav class="player-quick-actions" aria-label="${lang==='pt'?'Ações rápidas':'Quick actions'}">
        <button class="player-quick-action" id="weekly-plan" type="button">
          <span class="player-quick-icon">${playerIcon('calendar')}</span>
          <span class="player-quick-label">${lang==='pt'?'Plano semanal':'Weekly plan'}</span>
        </button>
        <button class="player-quick-action" id="weight-form" type="button">
          <span class="player-quick-icon">${playerIcon('scale')}</span>
          <span class="player-quick-label">${w.registerWeight}</span>
        </button>
        <button class="player-quick-action" id="game-form" type="button">
          <span class="player-quick-icon">${playerIcon('ball')}</span>
          <span class="player-quick-label">${w.postGame}</span>
        </button>
        <button class="player-quick-action" id="reminders" type="button">
          <span class="player-quick-icon">${playerIcon('bell')}</span>
          <span class="player-quick-label">${lang==='pt'?'Lembretes':'Reminders'}</span>
        </button>
      </nav>

      <section class="player-documents-section">
        <div class="player-list-card player-documents-card">
          ${af.map(f=>{const count=docs.filter(d=>d.folder===f).length;return `<button class="player-menu-row player-menu-row-clean" data-folder="${f}"><span class="player-row-copy"><strong>${esc(folderName(f))}</strong><small>${count} ${count===1?w.document:w.documents}</small></span><span class="player-chevron">${playerIcon('chevron')}</span></button>`;}).join('')}
        </div>
      </section>

      <div class="player-account-links">
        <button class="player-password-link" id="change-password" type="button">${w.changePassword}</button>
        <button class="player-password-link player-logout-link" id="player-logout" type="button">${lang==='pt'?'Terminar sessão':'Sign out'}</button>
      </div>
    </section>`;

    ui.root.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;render();});
    bind('weekly-plan',()=>{
      if(owner.weekly_status==='available'&&weekly){
        window.open('/api/documents/'+weekly.id,'_blank','noopener');
      }else if(owner.weekly_status==='updating'){
        notify('The Mile',lang==='pt'?'Estamos a atualizar o teu plano. Ficará disponível assim que terminarmos.':'We are updating your plan. It will be available as soon as we finish.');
      }else{
        notify('The Mile',lang==='pt'?'Estamos a aguardar o teu plano de treinos. Assim que o recebermos, atualizamos esta área.':'We are waiting for your training plan. As soon as we receive it, we will update this area.');
      }
    });
    bind('weight-form',()=>{if(user.weight_form_url)window.open(user.weight_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
    bind('game-form',()=>{if(user.game_form_url)window.open(user.game_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
    bind('reminders',()=>notify(lang==='pt'?'Lembretes':'Reminders',lang==='pt'?'Esta área ficará disponível quando ativarmos os lembretes do jogador.':'This area will be available when player reminders are enabled.'));
    bind('change-password',()=>{mode='password';render();});
    bind('player-logout',async()=>{await api('/logout',{method:'POST',body:{}});user=null;csrf=null;folder=null;mode='';docs=[];render();});
    return;
  }
  if(isAdmin&&mode==='edit'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><p class="eyebrow">${w.playerDetails}</p><h1>${esc(owner.name)}</h1>${playerForm(w,owner)}`;
    bind('back',()=>{mode='';render();});bind('cancel',()=>{mode='';render();});
    submit(async f=>{await api('/players/'+owner.id,{method:'PUT',body:await payloadFromForm(f)});selected=null;mode='';await refresh();});return;
  }
  if(mode==='password'){
    ui.root.innerHTML=`<button class="back" id="back">${w.back}</button><h1>${w.changePassword}</h1><form class="inline-form">${isAdmin?'':`<label>${w.currentPassword}</label><input name="current_password" type="password" required>`}<label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" required><p class="error"></p><div class="actions"><button class="primary" type="submit">${w.save}</button><button class="secondary" type="button" id="cancel">${w.cancel}</button></div></form>`;
    bind('back',()=>{mode='';render();});bind('cancel',()=>{mode='';render();});
    submit(async f=>{if(isAdmin)await api('/players/'+owner.id+'/password',{method:'POST',body:{password:f.get('new_password')}});else await api('/password',{method:'POST',body:{current_password:f.get('current_password'),new_password:f.get('new_password')}});mode='';notify('The Mile',w.passwordChanged);render();});return;
  }

  const af=availableFolders(owner);
  const title=folder===null?(isAdmin?owner.name:w.hello+' '+owner.name.split(' ')[0]+'.'):w.folders[folder];
  ui.root.innerHTML=`${isAdmin||folder!==null?'<button class="back" id="back">'+w.back+'</button>':''}
    ${folder===null?`<p class="eyebrow">${isAdmin?'@'+esc(owner.username):w.private}</p>`:''}
    <div class="topline"><h1>${esc(title)}</h1>${isAdmin&&folder!==null&&mode!=='upload'?'<button class="primary" id="upload">'+w.upload+'</button>':''}</div>
    ${folder===null?`
      <section class="profile-card">${owner.has_photo?`<img src="/api/players/${owner.id}/photo" alt="">`:''}<div><strong>${esc(owner.name)}</strong><p>@${esc(owner.username)}</p></div></section>
      ${!isAdmin?`<div class="quick-actions"><button class="secondary" id="weight-form">${w.registerWeight}</button><button class="secondary" id="game-form">${w.postGame}</button></div>`:''}
      <p class="subtitle">${w.sub}</p><div class="folders">${af.map(f=>{const c=docs.filter(d=>d.folder===f).length;return `<button class="folder" data-folder="${f}"><span class="folder-icon"></span><div><strong>${w.folders[f]}</strong><small>${c} ${c===1?w.document:w.documents}</small></div></button>`;}).join('')}</div>
      ${isAdmin?`<div class="player-control"><div><span class="badge ${statusClass(owner)}">${statusLabel(owner,w)}</span><p>${w.birthDate}: ${esc(owner.birth_date)} · ${w.sex}: ${owner.sex==='M'?w.male:w.female} · ${w.height}: ${esc(owner.height)} · ${w.weight}: ${esc(owner.weight)} · ${w.planName}: ${esc(owner.plan_name)} · ${w.renewalDate}: ${esc(owner.renewal_date)}</p></div><div class="actions player-actions"><button class="secondary" id="edit">${w.edit}</button><button class="secondary" id="change-password">${w.resetPassword}</button><button class="secondary" id="status">${owner.active?w.deactivate:w.reactivate}</button><button class="secondary danger" id="delete-player">${w.deletePlayer}</button></div></div>`:''}
    `:
    mode==='upload'?`<form class="inline-form"><label>${w.documentTitle}</label><input name="title" maxlength="180" required><label>${w.file}</label><input name="pdf" type="file" accept="application/pdf,.pdf" required><p class="note">${w.pdfNote}</p><p class="error"></p><div class="actions"><button class="primary" type="submit">${w.save}</button><button class="secondary" id="cancel" type="button">${w.cancel}</button></div></form>`:
    `${isAdmin&&folder==='weekly'?`<div class="player-control weekly-plan-admin"><div><strong>${lang==='pt'?'Estado do plano semanal':'Weekly plan status'}</strong><p>${owner.weekly_status==='available'?(lang==='pt'?'Disponível':'Available'):owner.weekly_status==='updating'?(lang==='pt'?'Em atualização':'Updating'):(lang==='pt'?'A aguardar plano de treinos':'Waiting for training plan')}</p></div><div class="actions"><select id="weekly-status"><option value="available" ${owner.weekly_status==='available'?'selected':''}>${lang==='pt'?'Disponível':'Available'}</option><option value="waiting" ${owner.weekly_status==='waiting'?'selected':''}>${lang==='pt'?'A aguardar plano de treinos':'Waiting for training plan'}</option><option value="updating" ${owner.weekly_status==='updating'?'selected':''}>${lang==='pt'?'Em atualização':'Updating'}</option></select></div></div>`:''}
    ${docs.filter(d=>d.folder===folder).map(d=>`<div class="row"><div><strong>${esc(d.title)}</strong><p>PDF · ${new Intl.DateTimeFormat(lang==='pt'?'pt-PT':'en-GB').format(new Date(d.updated*1000))}${folder==='weekly'&&owner.current_weekly_document_id===d.id?(lang==='pt'?' · Atual':' · Current'):''}</p></div><div class="actions"><a class="primary download" href="/api/documents/${d.id}">${w.open}</a>${isAdmin?`<button class="secondary" data-title="${d.id}">${w.editTitle}</button><button class="secondary" data-replace="${d.id}">${w.replace}</button>${folder==='weekly'?(owner.current_weekly_document_id===d.id?`<button class="secondary" disabled>${lang==='pt'?'Atual':'Current'}</button>`:`<button class="secondary" data-weekly-current="${d.id}">${lang==='pt'?'Definir como atual':'Set as current'}</button>`):''}<button class="secondary danger" data-delete="${d.id}">${w.remove}</button>`:''}</div></div>`).join('')||`<p class="empty">${w.empty}</p>`}`}`;

  bind('back',async()=>{if(mode){mode='';render();}else if(folder!==null){folder=null;render();}else{selected=null;await refresh();}});
  ui.root.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;mode='';render();});
  bind('upload',()=>{mode='upload';render();});bind('cancel',()=>{mode='';render();});bind('edit',()=>{mode='edit';render();});if(isAdmin)bind('change-password',()=>{mode='password';render();});
  bind('status',async()=>{if(!confirm(w.statusConfirm))return;await api('/players/'+owner.id+'/status',{method:'POST',body:{active:!owner.active}});selected=null;await refresh();});
  bind('delete-player',async()=>{if(!confirm(w.deletePlayerConfirm))return;await api('/players/'+owner.id,{method:'DELETE'});selected=null;folder=null;await refresh();});
  bind('weight-form',()=>{if(user.weight_form_url)window.open(user.weight_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
  bind('game-form',()=>{if(user.game_form_url)window.open(user.game_form_url,'_blank','noopener');else notify('The Mile',w.formsUnavailable);});
  const weeklyStatus=document.getElementById('weekly-status');
  if(weeklyStatus)weeklyStatus.onchange=async()=>{
    await api('/players/'+owner.id+'/weekly-status',{method:'POST',body:{status:weeklyStatus.value}});
    const p=(await api('/players')).players.find(x=>x.id===owner.id);
    if(p){selected=p;}
    docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;
    render();
  };
  ui.root.querySelectorAll('[data-weekly-current]').forEach(b=>b.onclick=async()=>{
    await api('/players/'+owner.id+'/weekly-current',{method:'POST',body:{document_id:b.dataset.weeklyCurrent}});
    const p=(await api('/players')).players.find(x=>x.id===owner.id);
    if(p)selected=p;
    docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;
    render();
  });


  if(mode==='upload')submit(async f=>{const file=f.get('pdf');if(!file||!file.size)throw Error('pdf_only');if(file.size>20*1024*1024)throw Error('file_size');await api('/documents?player='+encodeURIComponent(owner.id)+'&folder='+folder+'&title='+encodeURIComponent(String(f.get('title')||'').trim()),{method:'POST',body:file,binary:true});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;mode='';render();});
  ui.root.querySelectorAll('[data-title]').forEach(b=>b.onclick=async()=>{const d=docs.find(x=>x.id===b.dataset.title),title=prompt(w.titlePrompt,d?.title||'');if(title===null||!title.trim())return;await api('/documents/'+b.dataset.title,{method:'PATCH',body:{title:title.trim()}});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();});
  ui.root.querySelectorAll('[data-replace]').forEach(b=>b.onclick=()=>{const i=document.createElement('input');i.type='file';i.accept='application/pdf,.pdf';i.onchange=async()=>{const f=i.files[0];if(!f)return;await api('/documents/'+b.dataset.replace,{method:'PUT',body:f,binary:true});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();};i.click();});
  ui.root.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm(w.removeConfirm))return;await api('/documents/'+b.dataset.delete,{method:'DELETE'});docs=(await api('/documents?player='+encodeURIComponent(owner.id))).documents;render();});
}

function render(){
  document.body.ontouchstart=null;document.body.ontouchmove=null;document.body.ontouchend=null;document.body.ontouchcancel=null;document.body.classList.remove('swipe-revealing');
  const w=t();document.documentElement.lang=lang==='pt'?'pt-PT':'en';document.body.classList.toggle('player-theme',!!user&&user.role==='player');document.body.classList.toggle('player-internal',!!user&&user.role==='player'&&(folder!==null||mode==='password'));document.body.classList.toggle('login-theme',!user&&!activationToken&&loginMode==='login');ui.lang.textContent=lang==='pt'?'EN':'PT';ui.lang.hidden=!!user&&!(user.role==='player'&&folder===null&&mode==='');ui.logout.hidden=!user||user.role==='player';ui.logout.textContent=w.logout;ui.install.textContent=w.install;document.getElementById('tagline').textContent=w.foot;
  const internalPlayer=!!user&&user.role==='player'&&(folder!==null||mode==='password');
  ui.headerBack.hidden=!internalPlayer;
  ui.headerBack.innerHTML=`${playerIcon('arrow')}<span>${w.back.replace('← ','')}</span>`;
  ui.headerBack.onclick=internalPlayer?()=>{if(folder!==null)folder=null;else if(mode==='password')mode='';render();}:null;
  if(!user||activationToken){
    const activating=!!activationToken;
    if(!activating && loginMode==='change'){
      ui.root.innerHTML=`<div class="login"><p class="eyebrow">The Mile</p><h1>${w.changeAccess}</h1><p class="subtitle">${w.loginSub}</p><form><label>${w.username}</label><input name="identifier" autocomplete="username" required><label>${w.currentPassword}</label><input name="current_password" type="password" autocomplete="current-password" required><label>${w.newPassword}</label><input name="new_password" type="password" minlength="8" maxlength="256" required><p class="error"></p><button class="primary" type="submit">${w.save}</button></form><button id="back-login" class="subtle">${w.backToLogin}</button></div>`;
      submit(async f=>{await api('/change-password',{method:'POST',body:{identifier:f.get('identifier'),current_password:f.get('current_password'),new_password:f.get('new_password')}});loginMode='login';notify('The Mile',w.passwordChanged);render();});
      bind('back-login',()=>{loginMode='login';render();});
      return;
    }
    ui.root.innerHTML=activating
      ? `<div class="login"><p class="eyebrow">The Mile</p><h1>${w.activate}</h1><p class="subtitle">${w.activateSub}</p><form><label>${w.password}</label><input name="password" type="password" autocomplete="new-password" minlength="12" required><label>${w.confirm}</label><input name="confirm" type="password" minlength="12" required><p class="error"></p><button class="primary" type="submit">${w.save}</button></form></div>`
      : `<div class="login login-home"><div class="login-heading"><h1>${lang==='pt'?'Área privada':'Private area'}</h1></div><form><label>${w.username}</label><input name="identifier" autocomplete="username" required><label>${w.password}</label><input name="password" type="password" autocomplete="current-password" required><p class="error"></p><button class="login-primary" type="submit">${w.enter}</button></form><button id="forgot" class="login-forgot" type="button">${w.forgot}</button></div>`;
    submit(async f=>{if(activating&&f.get('password')!==f.get('confirm'))throw Error('password_mismatch');await api(activating?'/activate':'/login',{method:'POST',body:{identifier:f.get('identifier'),password:f.get('password'),token:activationToken}});activationToken=null;await refresh();});
    bind('forgot',()=>notify('The Mile',w.forgotText));return;
  }
  if(user.role==='admin'&&!selected){renderDashboard(w);return;} renderPlayer(w);
}

ui.lang.onclick=()=>{lang=lang==='pt'?'en':'pt';localStorage.setItem('mile-language',lang);render();};
ui.logout.onclick=async()=>{await api('/logout',{method:'POST',body:{}});user=null;csrf=null;selected=null;folder=null;mode='';players=[];admins=[];docs=[];render();};
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function updateInstallButton(){ui.install.hidden=isStandalone()||(!installPrompt&&!isiOS());}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateInstallButton();});
ui.install.onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;updateInstallButton();}else notify('The Mile',lang==='pt'?'No iPhone, usa Partilhar → Adicionar ao ecrã principal.':'On iPhone, use Share → Add to Home Screen.');};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v=62').catch(()=>{}));
updateInstallButton();refresh().catch(e=>{render();error(e);}).finally(dismissSplash);
