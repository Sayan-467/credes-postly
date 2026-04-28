const { InlineKeyboard } = require('grammy');

function postTypeKeyboard() {
  return new InlineKeyboard()
    .text('📢 Announcement', 'type:announcement').text('🧵 Thread', 'type:thread').row()
    .text('📖 Story', 'type:story').text('🛒 Promotional', 'type:promotional').row()
    .text('🎓 Educational', 'type:educational').text('💬 Opinion', 'type:opinion');
}

function platformKeyboard(selected = []) {
  const mark = (p) => (selected.includes(p) ? '✅ ' : '');
  return new InlineKeyboard()
    .text(`${mark('twitter')}Twitter/X`, 'plat:twitter')
    .text(`${mark('mastodon')}Mastodon`, 'plat:mastodon').row()
    .text(`${mark('linkedin')}LinkedIn`, 'plat:linkedin').row()
    .text(`${mark('instagram')}Instagram`, 'plat:instagram')
    .text(`${mark('threads')}Threads`, 'plat:threads').row()
    .text('Select All', 'plat:all').row()
    .text('✅ Confirm Platforms', 'plat:confirm');
}

function toneKeyboard() {
  return new InlineKeyboard()
    .text('💼 Professional', 'tone:professional').text('😊 Casual', 'tone:casual').row()
    .text('😄 Witty', 'tone:witty').text('🎯 Authoritative', 'tone:authoritative').row()
    .text('🤝 Friendly', 'tone:friendly');
}

function modelKeyboard() {
  return new InlineKeyboard()
    .text('🦙 Groq (Llama 3.3)', 'model:groq').row()
    .text('✨ Gemini 1.5 Flash', 'model:gemini');
}

function confirmKeyboard() {
  return new InlineKeyboard()
    .text('✅ Post Now', 'confirm:post')
    .text('✏️ Edit Idea', 'confirm:edit')
    .text('❌ Cancel', 'confirm:cancel');
}

module.exports = {
  postTypeKeyboard, platformKeyboard, toneKeyboard,
  modelKeyboard, confirmKeyboard,
};