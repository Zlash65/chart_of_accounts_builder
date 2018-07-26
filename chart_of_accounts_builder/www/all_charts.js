erpnext = {};
erpnext.all_charts = {};

frappe.ready(function() {
	frappe.require("/assets/frappe/js/lib/awesomplete/awesomplete.min.js");
	frappe.require("/assets/frappe/js/lib/awesomplete/awesomplete.css");
	frappe.require("/assets/js/dialog.min.js");

	frappe.require("/assets/js/control.min.js");
	
	erpnext.all_charts.make_new_chart();

	// toggle between tabs
    $(".tab_content").hide();
    $(".tab_content:first").show();

    $("ul.tabs li").click(function() {
		$(".tab_content").hide();
		var activeTab = $(this).attr("rel");
		$("#"+activeTab).toggle();

		$("ul.tabs li").removeClass("active");
		$(this).addClass("active");
    });

	$('ul.tabs li').last().addClass("tab_last");
});


erpnext.all_charts.make_new_chart = function() {
	$(".new-chart").on("click", function() {
		frappe.call({
			method: "chart_of_accounts_builder.utils.get_countries",
			callback: function(r) {
				if(!r.exc) {
					var d = new frappe.ui.Dialog({
						title:__('New Chart'),
						fields: [
							{
								fieldtype:'Select', fieldname:'country',
								label:__('Country'), reqd:true,
								options: [""].concat(r.message).join("\n")
							}
						]
					});

					d.set_primary_action(__("Create"), function() {
						var btn = this;
						var v = d.get_values();
						if(!v) return;

						return frappe.call({
							method:"chart_of_accounts_builder.utils.create_new_chart",
							args: {
								"country": v.country
							},
							freeze: true,
							btn: d.get_primary_btn(),
							callback: function(r,rt) {
								if(!r.exc && r.message) {
									d.hide();
									window.location.href = "/chart?company=" + r.message + "&forked=1&submitted=0"
								}
							}
						});
					});

					d.show()
				}
			}
		})
	})
}
