const STORAGE_KEY = 'campus-fit-feedback-draft'
Page({
  data: { content: '', count: 0 },
  onShow() {
    const content = wx.getStorageSync(STORAGE_KEY) || ''
    this.setData({ content, count: content.length })
  },
  onInput(event) {
    const content = event.detail.value || ''
    this.setData({ content, count: content.length })
    wx.setStorageSync(STORAGE_KEY, content)
  },
  copyDraft() {
    if (!this.data.content.trim()) { wx.showToast({ title: '请先填写反馈', icon: 'none' }); return }
    wx.setClipboardData({ data: this.data.content, success: () => wx.showToast({ title: '反馈已复制，可自行发送', icon: 'success' }) })
  },
  clearDraft() {
    wx.showModal({ title: '清空反馈草稿？', content: '草稿只保存在当前设备。', confirmText: '清空', success: result => {
      if (!result.confirm) return
      wx.removeStorageSync(STORAGE_KEY)
      this.setData({ content: '', count: 0 })
    } })
  }
})
