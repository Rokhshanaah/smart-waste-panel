const GEO_DISTRICT = { endpoint: 'geo/districts', label: 'name' };
const CASH_BOX = { endpoint: 'cash_boxes', label: 'name' };
const LINK_AREAS = { to: '/areas', label: 'مناطق و خانه‌ها' };
const LINK_CUSTOMERS = { to: '/customers', label: 'شهروندان' };
const LINK_REPORTS = { to: '/reports', label: 'گزارشات' };
const LINK_DASHBOARD = { to: '/', label: 'داشبورد' };
const LINK_CASH = { to: '/cash_box_transactions', label: 'صندوق' };

/** فقط وقتی روش پرداخت نسیه باشد */
const DEBTOR_PERSON = ['customer_id', 'شخص نسیه', 'relation', false, {
  endpoint: 'customers',
  label: 'full_name',
  showWhenCredit: true,
}];

export const moduleConfigs = {
  customers: {
    title: 'شهروندان',
    singular: 'شهروند',
    endpoint: 'customers',
    addressCascade: true,
    relatedLinks: [LINK_AREAS, LINK_DASHBOARD, { to: '/bills', label: 'بل‌ها' }, { to: '/complaints', label: 'شکایت‌ها' }],
    columns: [
      ['full_name', 'نام کامل'], ['phone', 'شماره تماس'],
      ['district', 'ناحیه'], ['street', 'گذر'], ['alley', 'کوچه'], ['house_number', 'پلاک'], ['status', 'وضعیت']
    ],
    fields: [
      ['full_name', 'نام کامل', 'text', true], ['phone', 'شماره تماس', 'text', true],
      ['province', 'ولایت', 'text', true], ['city', 'شهر', 'text', true],
      ['house_id', 'خانه', 'geo_address'],
      ['district', 'ناحیه', 'hidden'],
      ['street', 'گذر', 'hidden'],
      ['alley', 'کوچه', 'hidden'],
      ['house_number', 'پلاک', 'hidden'],
      ['floor_number', 'طبقه', 'text'],
      ['unit_number', 'واحد', 'text'],
      ['status', 'وضعیت', 'select', true, [['active','فعال'],['inactive','غیرفعال']]]
    ]
  },
  areas: {
    title: 'مناطق و خانه‌ها', singular: 'ناحیه', endpoint: 'areas',
    columns: [['name','نام'],['district','ناحیه'],['monthly_fee','فیس ماهانه'],['house_count','تعداد خانه'],['status','وضعیت']],
    fields: [
      ['name','نام','text',true],['district','ناحیه','text',true],
      ['monthly_fee','فیس ماهانه','number',true],['house_count','تعداد خانه','number'],
      ['status','وضعیت','select',true,[['active','فعال'],['inactive','غیرفعال']]]
    ]
  },
  bills: {
    title: 'بل‌ها', singular: 'بل', endpoint: 'bills',
    syncFromCustomer: true,
    autoBillNumber: true,
    autoFillFromHouse: true,
    relatedLinks: [LINK_CUSTOMERS, LINK_AREAS, LINK_CASH, LINK_REPORTS],
    columns: [['bill_number','شماره بل'],['customer_id','مشتری'],['month_name','ماه'],['amount','مبلغ'],['paid_amount','پرداخت شده'],['status','وضعیت']],
    fields: [
      ['bill_number','شماره بل (خودکار)','readonly',true],
      ['customer_id','مشتری','relation',true,{ endpoint:'customers', label:'full_name' }],
      ['area_id','ناحیه','relation',false, GEO_DISTRICT],
      ['house_id','خانه','geo_address'],
      ['billing_type','نوع پرداخت','select',true,[['weekly','هفته‌وار'],['monthly','ماهانه'],['quarterly','سه‌ماهه'],['yearly','سالانه']]],
      ['month_name','ماه','select',true,[
        ['حمل','حمل'],['ثور','ثور'],['جوزا','جوزا'],['سرطان','سرطان'],
        ['اسد','اسد'],['سنبله','سنبله'],['میزان','میزان'],['عقرب','عقرب'],
        ['قوس','قوس'],['جدی','جدی'],['دلو','دلو'],['حوت','حوت'],
      ]],
      ['amount','مبلغ','number',true],
      ['paid_amount','مبلغ پرداخت‌شده','number'],
      ['cash_box_id','صندوق','relation',false, CASH_BOX],
      ['payment_method','روش پرداخت','payment_method',false],
      ['due_date','تاریخ سررسید','date'],
      ['status','وضعیت','select',true,[['unpaid','پرداخت‌نشده'],['partial','قسمی'],['paid','پرداخت‌شده']]]
    ]
  },
  incomes: {
    title: 'درآمدها', singular: 'درآمد', endpoint: 'incomes',
    categoryScope: 'income',
    relatedLinks: [LINK_AREAS, LINK_CASH, LINK_REPORTS, LINK_DASHBOARD],
    columns: [['title','عنوان'],['category','دسته'],['amount','مبلغ'],['income_date','تاریخ'],['payment_method','روش'],['cash_box_id','صندوق']],
    fields: [
      ['title','عنوان درآمد','text',true],
      ['category','دسته‌بندی','category',true],
      ['amount','مبلغ','number',true],['income_date','تاریخ','date',true],
      ['payment_method','روش دریافت','payment_method',true],
      ['cash_box_id','صندوق','relation',true, CASH_BOX],
      DEBTOR_PERSON,
      ['notes','توضیحات','textarea']
    ]
  },
  expenses: {
    title: 'هزینه‌ها', singular: 'هزینه', endpoint: 'expenses',
    categoryScope: 'expense',
    excludeCategories: ['معاش', 'salary'],
    relatedLinks: [LINK_AREAS, LINK_CASH, LINK_REPORTS],
    columns: [
      ['title','عنوان'],['category','دسته'],['amount','مبلغ'],
      ['payment_method','روش'],['expense_date','تاریخ'],['cash_box_id','صندوق']
    ],
    fields: [
      ['title','عنوان هزینه','text',true],
      ['category','دسته‌بندی','category',true],
      ['amount','مبلغ','number',true],
      ['payment_method','روش پرداخت','payment_method',true],
      ['cash_box_id','صندوق','relation',true, CASH_BOX],
      DEBTOR_PERSON,
      ['expense_date','تاریخ','date',true],
      ['area_id','ناحیه','relation',false, GEO_DISTRICT],
      ['notes','توضیحات','textarea']
    ]
  },
  cash_box_transactions: {
    title: 'صندوق', singular: 'تراکنش صندوق', endpoint: 'cash_box_transactions',
    showCashSummary: true,
    manageCashBoxes: true,
    categoryScope: 'cash_box',
    relatedLinks: [{ to: '/incomes', label: 'درآمدها' }, { to: '/expenses', label: 'هزینه‌ها' }, LINK_AREAS, LINK_REPORTS],
    columns: [
      ['cash_box_id','صندوق'],['title','عنوان'],['direction','نوع'],['amount','مبلغ'],
      ['payment_method','روش'],['customer_id','شخص نسیه'],['transaction_date','تاریخ'],['category','دسته']
    ],
    fields: [
      ['cash_box_id','صندوق','relation',true, CASH_BOX],
      ['title','عنوان','text',true],
      ['direction','ورود/خروج','select',true,[['in','ورود به صندوق'],['out','خروج از صندوق']]],
      ['amount','مبلغ','number',true],
      ['payment_method','روش','payment_method',true],
      DEBTOR_PERSON,
      ['transaction_date','تاریخ','date',true],
      ['category','دسته‌بندی','category',true],
      ['notes','توضیحات','textarea']
    ]
  },
  material_sales: {
    title: 'فروش مواد', singular: 'فروش مواد', endpoint: 'recycling_records',
    queryParams: { transaction_type: 'sale' },
    defaultValues: { transaction_type: 'sale' },
    hiddenFields: ['transaction_type'],
    showStockSummary: true,
    relatedLinks: [{ to: '/recycling_records', label: 'بازیافت / انبار' }, { to: '/incomes', label: 'درآمدها' }, LINK_CASH, LINK_REPORTS],
    columns: [['material_type','نوع مواد'],['weight_kg','وزن'],['price_per_kg','قیمت هر کیلو'],['total_amount','مبلغ کل'],['payment_method','روش'],['cash_box_id','صندوق'],['record_date','تاریخ']],
    fields: [
      ['material_type','نوع مواد','select',true,[['iron','آهن'],['plastic','پلاستیک'],['aluminum','المونیم'],['wood','چوب'],['glass','شیشه'],['other','سایر']]],
      ['weight_kg','وزن به کیلو','number',true],['price_per_kg','قیمت هر کیلو','number',true],
      ['record_date','تاریخ','date',true],
      ['transaction_type','نوع عملیات','select',true,[['sale','فروش']]],
      ['payment_method','روش دریافت','payment_method',true],
      ['cash_box_id','صندوق','relation',true, CASH_BOX],
      DEBTOR_PERSON,
      ['notes','توضیحات','textarea']
    ]
  },
  recycling_records: {
    title: 'بازیافت / انبار', singular: 'ورود انبار', endpoint: 'recycling_records',
    queryParams: { transaction_type: 'stock' },
    defaultValues: { transaction_type: 'stock', price_per_kg: 0 },
    hiddenFields: ['transaction_type', 'price_per_kg'],
    showStockSummary: true,
    relatedLinks: [{ to: '/material_sales', label: 'فروش مواد' }, LINK_REPORTS, LINK_DASHBOARD],
    columns: [['material_type','نوع مواد'],['weight_kg','وزن ورود'],['record_date','تاریخ'],['notes','توضیحات']],
    fields: [
      ['material_type','نوع مواد','select',true,[['iron','آهن'],['plastic','پلاستیک'],['aluminum','المونیم'],['wood','چوب'],['glass','شیشه'],['other','سایر']]],
      ['weight_kg','وزن به کیلو','number',true],
      ['price_per_kg','قیمت هر کیلو','number',false],
      ['record_date','تاریخ','date',true],
      ['transaction_type','نوع عملیات','select',true,[['stock','ورود به انبار']]],
      ['notes','توضیحات','textarea']
    ]
  },
  employees: {
    title: 'کارمندان', singular: 'کارمند', endpoint: 'employees',
    relatedLinks: [
      LINK_AREAS,
      { to: '/collection_schedules', label: 'برنامه جمع‌آوری' },
      { to: '/trucks', label: 'موترها' },
    ],
    columns: [['full_name','نام کامل'],['phone','شماره تماس'],['job_title','وظیفه'],['salary','معاش'],['area_id','ناحیه'],['status','وضعیت']],
    fields: [
      ['full_name','نام کامل','text',true],['phone','شماره تماس','text',true],
      ['job_title','وظیفه','text',true],['salary','معاش ماهانه','number',true],
      ['area_id','ناحیه','relation',false, GEO_DISTRICT],['status','وضعیت','select',true,[['active','فعال'],['inactive','غیرفعال']]]
    ]
  },
  trucks: {
    title: 'موترها', singular: 'موتر', endpoint: 'trucks',
    relatedLinks: [LINK_AREAS, { to: '/collection_schedules', label: 'برنامه جمع‌آوری' }, { to: '/employees', label: 'کارمندان' }],
    columns: [['plate_number','شماره موتر'],['truck_type','نوع'],['driver_name','راننده'],['monthly_rent','کرایه'],['fuel_cost','تیل'],['status','وضعیت']],
    fields: [
      ['plate_number','شماره موتر','text',true],['truck_type','نوع موتر','text',true],
      ['driver_name','نام راننده','text'],['area_id','ناحیه','relation',false, GEO_DISTRICT],
      ['monthly_rent','کرایه ماهانه','number'],['fuel_cost','مصرف تیل','number'],['repair_cost','مصرف تعمیر','number'],
      ['status','وضعیت','select',true,[['active','فعال'],['broken','خراب'],['repair','در تعمیر'],['inactive','غیرفعال']]]
    ]
  },
  collection_schedules: {
    title: 'برنامه جمع‌آوری', singular: 'برنامه', endpoint: 'collection_schedules',
    relatedLinks: [LINK_AREAS, { to: '/trucks', label: 'موترها' }, { to: '/employees', label: 'کارمندان' }, LINK_DASHBOARD],
    columns: [['area_id','ناحیه'],['days','روزها'],['collection_time','ساعت'],['truck_id','موتر'],['employee_id','کارمند'],['status','وضعیت']],
    fields: [
      ['area_id','ناحیه','relation',true, GEO_DISTRICT],['days','روزهای جمع‌آوری','text',true],
      ['collection_time','ساعت','time',true],['truck_id','موتر','relation',false,{ endpoint:'trucks', label:'plate_number' }],
      ['employee_id','کارمند','relation',false,{ endpoint:'employees', label:'full_name' }],['status','وضعیت','select',true,[['active','فعال'],['inactive','غیرفعال']]]
    ]
  },
  complaints: {
    title: 'شکایت‌ها', singular: 'شکایت', endpoint: 'complaints',
    syncFromCustomer: true,
    relatedLinks: [LINK_CUSTOMERS, LINK_AREAS, LINK_DASHBOARD],
    columns: [['title','عنوان'],['customer_id','مشتری'],['complaint_type','نوع'],['complaint_date','تاریخ'],['status','وضعیت']],
    fields: [
      ['customer_id','مشتری','relation',false,{ endpoint:'customers', label:'full_name' }],
      ['house_id','خانه / آدرس','geo_address'],
      ['title','عنوان شکایت','text',true],
      ['complaint_type','نوع شکایت','select',true,[['truck_missing','موتر نیامده'],['waste_remaining','زباله مانده'],['employee_issue','مشکل کارمند'],['payment_issue','مشکل پرداخت'],['other','سایر']]],
      ['description','توضیحات','textarea',true],['address','آدرس','textarea'],
      ['image_url','لینک عکس','text'],['complaint_date','تاریخ','date',true],
      ['status','وضعیت','select',true,[['new','جدید'],['reviewing','در حال بررسی'],['resolved','حل‌شده'],['rejected','ردشده']]]
    ]
  },
  users: {
    title: 'کاربران', singular: 'کاربر', endpoint: 'users',
    relatedLinks: [LINK_DASHBOARD, { to: '/settings', label: 'تنظیمات' }],
    columns: [['full_name','نام کامل'],['email','ایمیل'],['phone','شماره تماس'],['role','نقش'],['status','وضعیت']],
    fields: [
      ['full_name','نام کامل','text',true],['email','ایمیل','email',true],
      ['phone','شماره تماس','text'],['password','رمز عبور','password'],
      ['role','نقش','select',true,[['admin','مدیر'],['accountant','حسابدار'],['employee','کارمند'],['driver','راننده'],['citizen','شهروند']]],
      ['status','وضعیت','select',true,[['active','فعال'],['inactive','غیرفعال']]]
    ]
  }
};
