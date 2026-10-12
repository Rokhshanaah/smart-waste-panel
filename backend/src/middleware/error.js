export function notFound(req, res) {
  res.status(404).json({ message: 'مسیر مورد نظر پیدا نشد.' });
}

export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      message: 'مقدار انتخاب‌شده برای ارتباط (مثل منطقه یا مشتری) معتبر نیست. لطفاً از لیست موجود انتخاب کنید یا خالی بگذارید.',
    });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      message: 'این رکورد تکراری است و قبلاً ثبت شده.',
    });
  }

  res.status(err.status || 500).json({
    message: err.message || 'خطای داخلی سرور.',
  });
}
